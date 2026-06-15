/**
 * MV3 Service Worker
 *
 * - 初回インストール/ブラウザ起動時: 既存 watch タブへ注入して即利用可能にする
 * - 拡張更新時: 既存 watch タブをリロードし、古い extension context を残さない
 */

// @ts-nocheck — service worker; Chrome API と動的インデックスが多く checkJs コストが高い
// PR1-b-1: backfill SW エンジン(ビルド産物)。既存コードは無改修(設計正本: memory/reference_backfill_sw_migration_pr1b.md)
try { importScripts('dist/backfill-sw.js'); } catch (e) { console.warn('[NLS] backfill-sw load failed', e); } // eslint-disable-line no-undef

const MATCH_PATTERNS = [
  'https://*.nicovideo.jp/*',
  'http://127.0.0.1:3456/*',
  'http://localhost:3456/*'
];
const KEY_AUTO_BACKUP_STATE = 'nls_auto_backup_state';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
/** 配置未保存プロファイル向け: install または update で true → content が一度だけ書込 */
const KEY_INSTALL_PANEL_PLACEMENT_PENDING = 'nls_install_panel_placement_pending_v1';
const AUTO_BACKUP_ALARM = 'nls_auto_backup_every_5m';
const AUTO_BACKUP_PERIOD_MINUTES = 5;
const AUTO_BACKUP_DB_NAME = 'nls_auto_backup_v1';
const AUTO_BACKUP_DB_STORE = 'snapshots';
const AUTO_BACKUP_DB_VERSION = 1;
const AUTO_BACKUP_MAX_PER_LIVE = 24;

function commentsStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_comments_${id}`;
}

// v0.1.509: 追記専用チャンク（src/lib/commentChunkStore.js）のキー/読み出しのローカル版。
//   background は src/lib をバンドルしないため、commentsStorageKey と同様にミラーする。
function chunkIndexKeyLocal(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_cchunk_index_${id}`;
}
function chunkStorageKeyLocal(liveId, seq) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_cchunk_${id}_${Math.max(0, Math.floor(Number(seq) || 0))}`;
}
function tailStorageKeyLocal(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_ctail_${id}`;
}
function isChunkIndexLocal(obj, liveId) {
  if (!obj || typeof obj !== 'object') return false;
  if (Number(obj.v) !== 1) return false;
  if (!Array.isArray(obj.seqs)) return false;
  if (!Number.isFinite(Number(obj.total))) return false;
  const want = String(liveId || '').trim().toLowerCase();
  if (String(obj.liveId || '').trim().toLowerCase() !== want) return false;
  return true;
}
// 本体（チャンク or 従来 main にフォールバック）＋未畳み込みテールを連結して返す。
async function readAllCommentsForLiveLocal(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  const idxKey = chunkIndexKeyLocal(lid);
  const mainKey = commentsStorageKey(lid);
  let rows = [];
  const idxBag = await chrome.storage.local.get(idxKey);
  const index = idxBag[idxKey];
  if (isChunkIndexLocal(index, lid) && Array.isArray(index.seqs) && index.seqs.length) {
    const seqs = index.seqs.slice().sort((a, b) => a - b);
    const keys = seqs.map((seq) => chunkStorageKeyLocal(lid, seq));
    const bag = await chrome.storage.local.get(keys);
    for (const k of keys) {
      const part = bag[k];
      if (Array.isArray(part)) rows = rows.concat(part);
    }
  } else {
    const mainBag = await chrome.storage.local.get(mainKey);
    rows = Array.isArray(mainBag[mainKey]) ? mainBag[mainKey] : [];
  }
  const tKey = tailStorageKeyLocal(lid);
  const tailBag = await chrome.storage.local.get(tKey);
  const tail = Array.isArray(tailBag[tKey]) ? tailBag[tKey] : [];
  if (tail.length) {
    rows = rows.concat(
      tail.filter((r) => r && typeof r === 'object' && String(r.text ?? '').trim())
    );
  }
  return rows;
}

/* ================================================================== */
/* v0.1.514: コメント本体 IndexedDB（拡張オリジン・SW が単一書き手）            */
/*                                                                      */
/* chrome.storage.local（値まるごと structured clone・約120 writes/min・       */
/* 50MB 超で劣化・多タブで単一ストアを奪い合い）から IndexedDB へ移す。SW が     */
/* 全タブの append を 1 本に集約して書くので、ページ描画スレッドは重い書きから    */
/* 解放され、多タブ競合も根治する。                                            */
/*                                                                      */
/* スキーマ定数は src/lib/commentDb.js の正本をミラー（ESM import 不可の手書き    */
/* SW のため）。drift は src/lib/commentDb.test.js がリテラル検査で検知する。     */
/* dedupe キー（dkey）は content（buildDedupeKey）が付与して渡す。SW はキー式を   */
/* 持たず dkey だけで重複判定する（移行時だけ下の buildDedupeKeyLocal を使う）。   */
/* ================================================================== */
const COMMENT_DB_NAME = 'nls_comment_db_v1';
const COMMENT_DB_STORE = 'comments';
const COMMENT_DB_VERSION = 1;
const COMMENT_DB_INDEX_BY_LIVE = 'byLive';
const COMMENT_DB_INDEX_BY_DKEY = 'byDkey';
const COMMENT_TEXT_MAX_CHARS = 1000;
const CDB_APPEND_MESSAGE_TYPE = 'NLS_CDB_APPEND';
const CDB_ENSURE_MESSAGE_TYPE = 'NLS_CDB_ENSURE';
const CDB_SUMMARY_RECENT_MAX = 60;
const CDB_MIGRATE_BATCH = 2000;

/* feat/multitab-scale-globalcap: Offscreen 書き手への転送（opt-in）。              */
/*   SW は ephemeral（5分で停止し append のたび DB open/close）なので、IDB の常駐    */
/*   書き手を Offscreen Document に逃がす経路を用意する。content が mode:'offscreen' */
/*   で生 rows を送ってきたときだけ、Offscreen を保証して転送し、戻りの total/recent  */
/*   で summary（chrome.storage）を書く（Offscreen は storage 不可なので SW が書く）。 */
const OFFSCREEN_URL = 'offscreen.html';
const OFFSCREEN_APPEND_TYPE = 'NLS_OFFSCREEN_CDB_APPEND';
let _creatingOffscreen = null;

async function hasOffscreenDocument() {
  try {
    if (chrome.runtime.getContexts) {
      const ctxs = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      return Array.isArray(ctxs) && ctxs.length > 0;
    }
  } catch {
    /* fall through */
  }
  // 古い Chrome 用フォールバック（SW グローバルの clients）。getContexts は 116+、offscreen は
  //   109+ なので 109〜115 ではこちらで存在確認する。
  try {
    const swClients = globalThis.clients;
    if (swClients && swClients.matchAll) {
      const matched = await swClients.matchAll();
      const want = chrome.runtime.getURL(OFFSCREEN_URL);
      return matched.some((c) => c.url === want);
    }
  } catch {
    /* no-op */
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) return false;
  try {
    if (await hasOffscreenDocument()) return true;
    if (_creatingOffscreen) {
      await _creatingOffscreen;
      return true;
    }
    _creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification:
        'Maintain a persistent IndexedDB writer for locally-stored broadcast comments across multiple tabs.'
    });
    await _creatingOffscreen;
    _creatingOffscreen = null;
    return true;
  } catch {
    _creatingOffscreen = null;
    // 競合（既に作成済み等）は存在確認で吸収する。
    try {
      return await hasOffscreenDocument();
    } catch {
      return false;
    }
  }
}

function deriveAppendTabKey(sender) {
  const tabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
  const frameId = sender && sender.frameId != null ? sender.frameId : 0;
  if (tabId != null) return `t${tabId}:${frameId}`;
  return `u${(sender && sender.url) || '_'}`;
}

function commentDbSummaryKeyLocal(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_cdb_summary_${id}`;
}
function commentDbMigratedKeyLocal(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_cdb_migrated_${id}`;
}

// src/lib/commentRecord.js の normalizeCommentText / buildDedupeKey ミラー（移行専用）。
function normalizeCommentTextLocal(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
    .slice(0, COMMENT_TEXT_MAX_CHARS);
}
function buildDedupeKeyLocal(liveId, rec) {
  const text = normalizeCommentTextLocal(rec && rec.text);
  const no = String((rec && rec.commentNo) ?? '').trim();
  if (no) return `${liveId}|${no}|${text}`;
  const sec = Math.floor(Number((rec && rec.capturedAt) || 0) / 1000);
  const uid = String((rec && rec.userId) ?? '').trim();
  return `${liveId}||${text}|${sec}|${uid}`;
}

function openCommentDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(COMMENT_DB_NAME, COMMENT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(COMMENT_DB_STORE)) {
        const store = db.createObjectStore(COMMENT_DB_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex(COMMENT_DB_INDEX_BY_LIVE, 'liveId', { unique: false });
        store.createIndex(COMMENT_DB_INDEX_BY_DKEY, 'dkey', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normalizeCommentDbRecord(liveId, row) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !row || typeof row !== 'object') return null;
  const text = String(row.text ?? '').trim();
  if (!text) return null;
  const dkey = String(row.dkey ?? '').trim();
  if (!dkey) return null;
  const rec = {
    liveId: lid,
    dkey,
    commentNo: String(row.commentNo ?? '').trim(),
    text,
    userId: row.userId != null ? String(row.userId) : null,
    capturedAt: Math.max(0, Number(row.capturedAt) || 0) || Date.now()
  };
  if (row.nickname) rec.nickname = String(row.nickname);
  if (row.avatarUrl) rec.avatarUrl = String(row.avatarUrl);
  if (row.avatarObserved) rec.avatarObserved = true;
  if (row.vpos != null) rec.vpos = Number(row.vpos);
  if (row.accountStatus != null) rec.accountStatus = Number(row.accountStatus);
  if (row.is184) rec.is184 = true;
  if (row.selfPosted) rec.selfPosted = true;
  return rec;
}

function appendCommentsToDb(db, liveId, rows) {
  const lid = String(liveId || '').trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];
  return new Promise((resolve, reject) => {
    if (!lid || list.length === 0) {
      resolve({ added: 0 });
      return;
    }
    let added = 0;
    const batchSeen = new Set();
    const tx = db.transaction(COMMENT_DB_STORE, 'readwrite');
    const store = tx.objectStore(COMMENT_DB_STORE);
    const dkeyIndex = store.index(COMMENT_DB_INDEX_BY_DKEY);
    for (const row of list) {
      const rec = normalizeCommentDbRecord(lid, row);
      if (!rec) continue;
      if (batchSeen.has(rec.dkey)) continue;
      batchSeen.add(rec.dkey);
      const getReq = dkeyIndex.getKey(rec.dkey);
      getReq.onsuccess = () => {
        if (getReq.result === undefined || getReq.result === null) {
          const addReq = store.add(rec);
          // 個別 add の失敗（稀な制約衝突など）はトランザクション全体を abort させない。
          addReq.onerror = (e) => {
            try {
              e.preventDefault();
            } catch {
              /* no-op */
            }
          };
          addReq.onsuccess = () => {
            added += 1;
          };
        }
      };
      // 個別 getKey の失敗も全体を巻き込まない。
      getReq.onerror = (e) => {
        try {
          e.preventDefault();
        } catch {
          /* no-op */
        }
      };
    }
    tx.oncomplete = () => resolve({ added });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function countCommentsForLiveDb(db, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  return new Promise((resolve, reject) => {
    if (!lid) {
      resolve(0);
      return;
    }
    const tx = db.transaction(COMMENT_DB_STORE, 'readonly');
    const idx = tx.objectStore(COMMENT_DB_STORE).index(COMMENT_DB_INDEX_BY_LIVE);
    const req = idx.count(IDBKeyRange.only(lid));
    req.onsuccess = () => {
      const n = Number(req.result);
      resolve(Number.isFinite(n) && n >= 0 ? n : 0);
    };
    req.onerror = () => reject(req.error);
  });
}

function readRecentCommentsForLiveDb(db, liveId, n) {
  const lid = String(liveId || '').trim().toLowerCase();
  const want = Math.max(0, Math.floor(Number(n) || 0));
  return new Promise((resolve, reject) => {
    if (!lid || want === 0) {
      resolve([]);
      return;
    }
    const out = [];
    const tx = db.transaction(COMMENT_DB_STORE, 'readonly');
    const idx = tx.objectStore(COMMENT_DB_STORE).index(COMMENT_DB_INDEX_BY_LIVE);
    const curReq = idx.openCursor(IDBKeyRange.only(lid), 'prev');
    curReq.onsuccess = () => {
      const cursor = curReq.result;
      if (!cursor || out.length >= want) {
        out.reverse();
        resolve(out);
        return;
      }
      out.push(cursor.value);
      cursor.continue();
    };
    curReq.onerror = () => reject(curReq.error);
  });
}

function readAllCommentsForLiveDb(db, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  return new Promise((resolve, reject) => {
    if (!lid) {
      resolve([]);
      return;
    }
    const out = [];
    const tx = db.transaction(COMMENT_DB_STORE, 'readonly');
    const idx = tx.objectStore(COMMENT_DB_STORE).index(COMMENT_DB_INDEX_BY_LIVE);
    const curReq = idx.openCursor(IDBKeyRange.only(lid));
    curReq.onsuccess = () => {
      const cursor = curReq.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      out.push(cursor.value);
      cursor.continue();
    };
    curReq.onerror = () => reject(curReq.error);
  });
}

// 既存 chrome.storage.local（main/chunk/tail）→ IDB の初回移行（live ごと 1 回）。
async function ensureLiveMigratedToDb(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  const mkey = commentDbMigratedKeyLocal(lid);
  const bag = await chrome.storage.local.get(mkey);
  if (bag[mkey] === true) return;
  let existing = [];
  try {
    existing = await readAllCommentsForLiveLocal(lid);
  } catch {
    existing = [];
  }
  if (existing.length) {
    const db = await openCommentDb();
    try {
      for (let i = 0; i < existing.length; i += CDB_MIGRATE_BATCH) {
        const slice = existing.slice(i, i + CDB_MIGRATE_BATCH).map((r) => ({
          ...r,
          dkey: buildDedupeKeyLocal(lid, r)
        }));
        await appendCommentsToDb(db, lid, slice);
      }
    } finally {
      db.close();
    }
  }
  await chrome.storage.local.set({ [mkey]: true });
}

// 与えられた total/recent から summary（chrome.storage）+ auto-backup 状態を書く。
//   Offscreen 経路では Offscreen が IDB から集計した値を渡してくる（SW は再走査しない）。
async function writeCommentDbSummaryFromValues(liveId, watchUrl, total, recentInput) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return 0;
  const now = Date.now();
  const recent = (Array.isArray(recentInput) ? recentInput : []).map((r) => ({
    commentNo: String(r.commentNo ?? ''),
    text: String(r.text ?? ''),
    userId: r.userId != null ? String(r.userId) : null,
    capturedAt: Number(r.capturedAt) || 0,
    is184: r.is184 === true
  }));
  const summary = { v: 1, liveId: lid, total, updatedAt: now, recent };

  // auto-backup 状態（5分周期の backup が IDB から読み直すためのメタ）。
  const stBag = await chrome.storage.local.get(KEY_AUTO_BACKUP_STATE);
  const st = normalizeAutoBackupState(stBag[KEY_AUTO_BACKUP_STATE]);
  const prev = st.lives[lid] || {};
  st.lives[lid] = {
    ...prev,
    liveId: lid,
    commentCount: total,
    updatedAt: now,
    lastCommentAt: now,
    watchUrl: String(watchUrl || prev.watchUrl || '').trim()
  };

  await chrome.storage.local.set({
    [commentDbSummaryKeyLocal(lid)]: summary,
    [KEY_AUTO_BACKUP_STATE]: st
  });
  return total;
}

// append 後に popup 初期描画用の軽量サマリと auto-backup 状態を更新する（SW 直書き経路）。
async function writeCommentDbSummaryAndBackupState(db, liveId, watchUrl) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return 0;
  const total = await countCommentsForLiveDb(db, lid);
  const recentFull = await readRecentCommentsForLiveDb(db, lid, CDB_SUMMARY_RECENT_MAX);
  return writeCommentDbSummaryFromValues(lid, watchUrl, total, recentFull);
}

async function handleCommentDbAppend(msg, sender) {
  const lid = String(msg?.liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return { ok: false };
  if (!isIndexedDbAvailable()) return { ok: false, reason: 'no_idb' };
  await ensureLiveMigratedToDb(lid);
  const watchUrl =
    String(msg?.watchUrl || '').trim() ||
    (sender && sender.tab && sender.tab.url ? String(sender.tab.url) : '');

  // feat/multitab-scale-globalcap: Offscreen 書き手モード（content が mode:'offscreen' + 生 rows）。
  //   Offscreen を保証して転送し、戻りの total/recent で summary を書く（Offscreen は storage 不可）。
  //   Offscreen を作れない/応答しない環境は no_offscreen を返し、content が従来経路へフォールバック。
  if (msg?.mode === 'offscreen') {
    const rawRows = Array.isArray(msg?.rawRows) ? msg.rawRows : [];
    const ready = await ensureOffscreenDocument();
    if (!ready) return { ok: false, reason: 'no_offscreen' };
    let resp = null;
    try {
      resp = await chrome.runtime.sendMessage({
        type: OFFSCREEN_APPEND_TYPE,
        liveId: lid,
        rawRows,
        tabKey: deriveAppendTabKey(sender)
      });
    } catch {
      resp = null;
    }
    if (!resp || !resp.ok) return { ok: false, reason: 'offscreen_failed' };
    const total = await writeCommentDbSummaryFromValues(
      lid,
      watchUrl,
      Number(resp.total) || 0,
      Array.isArray(resp.recent) ? resp.recent : []
    );
    return { ok: true, added: Number(resp.added) || 0, total };
  }

  // 従来（v0.1.515）: dkey 付き rows を SW が直接 IDB へ書く。
  const rows = Array.isArray(msg?.rows) ? msg.rows : [];
  const db = await openCommentDb();
  let added = 0;
  let total = 0;
  try {
    const res = await appendCommentsToDb(db, lid, rows);
    added = res.added;
    total = await writeCommentDbSummaryAndBackupState(db, lid, watchUrl);
  } finally {
    db.close();
  }
  return { ok: true, added, total };
}

async function handleCommentDbEnsure(msg) {
  const lid = String(msg?.liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return { ok: false };
  if (!isIndexedDbAvailable()) return { ok: false, reason: 'no_idb' };
  await ensureLiveMigratedToDb(lid);
  const db = await openCommentDb();
  try {
    const total = await writeCommentDbSummaryAndBackupState(
      db,
      lid,
      String(msg?.watchUrl || '').trim()
    );
    return { ok: true, total };
  } finally {
    db.close();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.type !== CDB_APPEND_MESSAGE_TYPE && msg.type !== CDB_ENSURE_MESSAGE_TYPE)) {
    return undefined;
  }
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  const work =
    msg.type === CDB_APPEND_MESSAGE_TYPE
      ? handleCommentDbAppend(msg, sender)
      : handleCommentDbEnsure(msg);
  work.then(reply).catch(() => reply({ ok: false }));
  return true; // 非同期 sendResponse のため message channel を保持
});

function normalizeAutoBackupState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawLives =
    src &&
    typeof src === 'object' &&
    'lives' in src &&
    src.lives &&
    typeof src.lives === 'object'
      ? src.lives
      : {};
  const lives = {};
  for (const [liveId, meta] of Object.entries(rawLives)) {
    const lid = String(liveId || '').trim().toLowerCase();
    if (!lid) continue;
    const row = meta && typeof meta === 'object' ? meta : {};
    lives[lid] = {
      liveId: lid,
      commentCount: Math.max(0, Number(row.commentCount) || 0),
      updatedAt: Math.max(0, Number(row.updatedAt) || 0),
      lastCommentAt: Math.max(0, Number(row.lastCommentAt) || 0),
      watchUrl: String(row.watchUrl || '').trim(),
      lastBackupAt: Math.max(0, Number(row.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(row.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(row.lastBackupCount) || 0)
    };
  }
  return { lives };
}

function canonicalWatchUrl(liveId, rawUrl) {
  const lid = String(liveId || '').trim().toLowerCase();
  const url = String(rawUrl || '').trim();
  if (url && url.includes(lid)) return url;
  return `https://live.nicovideo.jp/watch/${lid}`;
}

function isIndexedDbAvailable() {
  return typeof indexedDB !== 'undefined';
}

function openAutoBackupDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTO_BACKUP_DB_NAME, AUTO_BACKUP_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTO_BACKUP_DB_STORE)) {
        const store = db.createObjectStore(AUTO_BACKUP_DB_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('byLive', 'liveId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveInternalAutoBackup(payload) {
  if (!isIndexedDbAvailable()) return false;
  const db = await openAutoBackupDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(AUTO_BACKUP_DB_STORE, 'readwrite');
      const store = tx.objectStore(AUTO_BACKUP_DB_STORE);
      const idx = store.index('byLive');
      const liveId = String(payload?.liveId || '').trim().toLowerCase();

      const addReq = store.add({
        liveId,
        exportedAt: Number(payload?.exportedAtEpochMs || Date.now()) || Date.now(),
        updatedAt: Number(payload?.updatedAt || 0) || 0,
        lastCommentAt: Number(payload?.lastCommentAt || 0) || 0,
        commentCount: Math.max(0, Number(payload?.commentCount) || 0),
        watchUrl: String(payload?.watchUrl || '').trim(),
        payload
      });
      addReq.onerror = () => reject(addReq.error);
      addReq.onsuccess = () => {
        const getReq = idx.getAll(liveId);
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => {
          const all = Array.isArray(getReq.result) ? getReq.result : [];
          all.sort(
            (a, b) =>
              (Number(a?.exportedAt || 0) - Number(b?.exportedAt || 0)) ||
              (Number(a?.id || 0) - Number(b?.id || 0))
          );
          const overflow = Math.max(0, all.length - AUTO_BACKUP_MAX_PER_LIVE);
          for (let i = 0; i < overflow; i += 1) {
            const id = Number(all[i]?.id || 0);
            if (id > 0) store.delete(id);
          }
        };
      };

      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

async function ensureAutoBackupAlarm() {
  try {
    const existing = await chrome.alarms.get(AUTO_BACKUP_ALARM);
    if (existing) return;
    chrome.alarms.create(AUTO_BACKUP_ALARM, {
      delayInMinutes: AUTO_BACKUP_PERIOD_MINUTES,
      periodInMinutes: AUTO_BACKUP_PERIOD_MINUTES
    });
  } catch {
    // no-op
  }
}

async function backupLiveCommentsIfNeeded(liveId, meta, lastWatchUrl) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  if ((Number(meta?.commentCount) || 0) <= 0) return null;
  if ((Number(meta?.updatedAt) || 0) <= (Number(meta?.lastBackedUpdatedAt) || 0)) {
    return null;
  }

  // v0.1.509: 全チャンク＋テールを連結して backup（チャンク移行後も取りこぼさない）。
  // v0.1.514: IDB 移行済みの live は IDB を正本として読む（chrome.storage は空/旧のため）。
  let comments = [];
  let migratedToDb = false;
  try {
    const mbag = await chrome.storage.local.get(commentDbMigratedKeyLocal(lid));
    migratedToDb = mbag[commentDbMigratedKeyLocal(lid)] === true;
  } catch {
    migratedToDb = false;
  }
  if (migratedToDb && isIndexedDbAvailable()) {
    const db = await openCommentDb();
    try {
      comments = await readAllCommentsForLiveDb(db, lid);
    } finally {
      db.close();
    }
  } else {
    comments = await readAllCommentsForLiveLocal(lid);
  }
  if (!comments.length) return null;

  const exportedAt = Date.now();
  const payload = {
    kind: 'nicolivelog-auto-backup',
    version: 1,
    exportedAt: new Date(exportedAt).toISOString(),
    exportedAtEpochMs: exportedAt,
    liveId: lid,
    watchUrl: canonicalWatchUrl(lid, meta?.watchUrl || lastWatchUrl),
    commentCount: comments.length,
    updatedAt: Number(meta?.updatedAt) || 0,
    lastCommentAt: Number(meta?.lastCommentAt) || 0,
    comments
  };
  const saved = await saveInternalAutoBackup(payload);
  if (!saved) return null;
  return {
    liveId: lid,
    backupAt: exportedAt,
    backedUpdatedAt: Number(meta?.updatedAt) || 0,
    backupCount: comments.length
  };
}

async function runAutoBackupCycle() {
  const bag = await chrome.storage.local.get([KEY_AUTO_BACKUP_STATE, KEY_LAST_WATCH_URL]);
  const state = normalizeAutoBackupState(bag[KEY_AUTO_BACKUP_STATE]);
  const lastWatchUrl = String(bag[KEY_LAST_WATCH_URL] || '').trim();
  const entries = Object.entries(state.lives).sort(
    (a, b) => (Number(a[1]?.updatedAt) || 0) - (Number(b[1]?.updatedAt) || 0)
  );
  if (!entries.length) return;

  const results = [];
  for (const [liveId, meta] of entries) {
    try {
      const done = await backupLiveCommentsIfNeeded(liveId, meta, lastWatchUrl);
      if (done) results.push(done);
    } catch {
      // no-op
    }
  }
  if (!results.length) return;

  const freshBag = await chrome.storage.local.get(KEY_AUTO_BACKUP_STATE);
  const freshState = normalizeAutoBackupState(freshBag[KEY_AUTO_BACKUP_STATE]);
  let changed = false;
  for (const res of results) {
    const cur = freshState.lives[res.liveId];
    if (!cur) continue;
    freshState.lives[res.liveId] = {
      ...cur,
      lastBackupAt: Math.max(Number(cur.lastBackupAt) || 0, res.backupAt),
      lastBackedUpdatedAt: Math.max(
        Number(cur.lastBackedUpdatedAt) || 0,
        res.backedUpdatedAt
      ),
      lastBackupCount: Math.max(0, Number(res.backupCount) || 0)
    };
    changed = true;
  }
  if (changed) {
    await chrome.storage.local.set({
      [KEY_AUTO_BACKUP_STATE]: freshState
    });
  }
}

async function queryTargetTabs() {
  try {
    return await chrome.tabs.query({ url: MATCH_PATTERNS });
  } catch {
    return [];
  }
}

async function injectIntoExistingTabs() {
  const tabs = await queryTargetTabs();
  for (const tab of tabs) {
    if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/page-intercept.js'],
        world: 'MAIN'
      });
    } catch {
      // タブがクラッシュ済み等
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/content.js']
      });
    } catch {
      // no-op
    }
  }
}

async function reloadExistingWatchTabs() {
  const tabs = await queryTargetTabs();
  for (const tab of tabs) {
    if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) continue;
    try {
      await chrome.tabs.reload(tab.id);
    } catch {
      // no-op
    }
  }
}

/**
 * manifest に side_panel があると、環境によってツールバー押下がサイドパネル側に取られ、
 * iframe 経由の表示が空に見えることがある。サイドパネル自動オープンは抑止する。
 * （ツールバー本体は onClicked でインライン前面化 or popup 窓。default_popup は使わない）
 */
function ensureToolbarOpensPopupNotSidePanel() {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.sidePanel &&
      typeof chrome.sidePanel.setPanelBehavior === 'function'
    ) {
      void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  } catch {
    // API 未対応・ポリシー制限
  }
}

/**
 * 内容は src/lib/migrateInlinePanelFloatToDock.js と同一（SW は ESM バンドル外のため重複）。
 */
async function migrateFloatingPanelToDockProfileOnce() {
  const K_PLACEMENT = 'nls_inline_panel_placement';
  const K_DONE = 'nls_inline_panel_float_to_dock_migrated';
  try {
    const bag = await chrome.storage.local.get([K_PLACEMENT, K_DONE]);
    if (bag[K_DONE] === true) return;
    if (String(bag[K_PLACEMENT] || '').trim().toLowerCase() !== 'floating') {
      return;
    }
    await chrome.storage.local.set({
      [K_PLACEMENT]: 'dock_bottom',
      [K_DONE]: true
    });
  } catch {
    // no-op
  }
}

/**
 * 0.1.63 (AS): below → dock_bottom のワンショット移行（SW 側コピー）。
 * 内容は src/lib/migrateInlinePanelBelowToDock.js と同一。
 */
async function migrateBelowPanelToDockProfileOnce() {
  const K_PLACEMENT = 'nls_inline_panel_placement';
  const K_DONE = 'nls_inline_panel_below_to_dock_migrated';
  // src/lib/migrateInlinePanelBelowToDock.js と同一の前段ガード（SW 二重記載）。
  const K_EXPLICIT = 'nls_inline_panel_placement_user_explicit_v1';
  try {
    const bag = await chrome.storage.local.get([K_PLACEMENT, K_DONE, K_EXPLICIT]);
    // ユーザー明示選択済みなら値もフラグも触らない（明示選択の巻き戻し防止）。
    if (bag[K_EXPLICIT] === true) return;
    if (bag[K_DONE] === true) return;
    const p = String(bag[K_PLACEMENT] || '').trim().toLowerCase();
    if (p !== 'below') {
      // 既に dock_bottom 等なら値は変えず flag だけ立てる
      await chrome.storage.local.set({ [K_DONE]: true });
      return;
    }
    await chrome.storage.local.set({
      [K_PLACEMENT]: 'dock_bottom',
      [K_DONE]: true
    });
  } catch {
    // no-op
  }
}

/**
 * 0.1.7 / 0.1.8 / 0.1.9 で焼き込まれた古い `selfPosted: true` を全 `nls_comments_*` から
 * 剥がす後方互換 migration（D-4）。SW は ESM バンドル外のため、純関数を import せず
 * 同等ロジックを SW 内にハードコピー（`migrateInlinePanelFloatToDockProfileOnce` と同パターン）。
 *
 * 起動条件:
 *   ・details.previousVersion が `'0.1.0'`〜`'0.1.9'` のいずれか（fresh install では走らない）
 *   ・nls_migration_clear_stale_selfposted_done_v1 がまだ true でない
 *
 * 動作:
 *   ・chrome.storage.local の全 key を走査し、`nls_comments_` プレフィックスを集める
 *   ・各配列の各行から `selfPosted` フィールドを物理削除
 *   ・done flag を立てて再実行を防ぐ
 *
 * 副作用:
 *   ・真に自コメだった行は、次の persist サイクルで content-entry の
 *     `consumeMatchedSelfPostedRecents` が KEY_SELF_POSTED_RECENTS の pending と
 *     再マッチして `selfPosted: true` を再付与する（24h TTL 内なら）。
 *
 * @param {string|undefined} previousVersion
 */
async function migrateClearStaleSelfPostedOnce(previousVersion) {
  const K_DONE = 'nls_migration_clear_stale_selfposted_done_v1';
  const BASELINE = '0.1.10';
  try {
    // semver 比較（major.minor.patch）。不正な値は走らせない（fresh install を含む）。
    const m = String(previousVersion || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return;
    const prev = [Number(m[1]), Number(m[2]), Number(m[3])];
    const base = BASELINE.split('.').map(Number);
    let runRequired = false;
    for (let i = 0; i < 3; i += 1) {
      if (prev[i] < base[i]) {
        runRequired = true;
        break;
      }
      if (prev[i] > base[i]) break;
    }
    if (!runRequired) return;

    const allBag = await chrome.storage.local.get(null);
    if (allBag[K_DONE] === true) return;

    /** @type {Record<string, unknown>} */
    const writes = {};
    let touchedKeys = 0;
    let strippedRows = 0;
    for (const [key, value] of Object.entries(allBag)) {
      if (!key.startsWith('nls_comments_')) continue;
      if (!Array.isArray(value)) continue;
      let changed = false;
      const next = value.map((row) => {
        if (row == null || typeof row !== 'object') return row;
        if (!('selfPosted' in row)) return row;
        if (row.selfPosted === true) strippedRows += 1;
        const cleaned = { ...row };
        delete cleaned.selfPosted;
        changed = true;
        return cleaned;
      });
      if (changed) {
        writes[key] = next;
        touchedKeys += 1;
      }
    }
    writes[K_DONE] = true;
    await chrome.storage.local.set(writes);
    if (typeof console !== 'undefined' && console?.info) {
      console.info(
        `[nicolivelog] stale selfPosted cleanup migration: ${strippedRows} rows ` +
          `stripped across ${touchedKeys} live(s) (previousVersion=${previousVersion})`
      );
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[nicolivelog] stale selfPosted cleanup migration failed:', err);
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureToolbarOpensPopupNotSidePanel();
  void ensureAutoBackupAlarm();
  void (async () => {
    await migrateFloatingPanelToDockProfileOnce();
    await migrateBelowPanelToDockProfileOnce();
    if (details?.reason === 'install') {
      try {
        await chrome.storage.local.set({
          [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: true
        });
      } catch {
        // no-op
      }
    }
    /*
     * 拡張「更新」でも、配置キーが一度も保存されていないプロファイルには
     * pending を立てる。初回 watch で content がタブ幅に応じた既定（横付き等）を
     * 書けるようにする（install 以外では従来 pending が立たず横付きにならない件）。
     */
    if (details?.reason === 'update') {
      try {
        const K_PL = 'nls_inline_panel_placement';
        const K_EXPLICIT = 'nls_inline_panel_placement_user_explicit_v1';
        const bagU = await chrome.storage.local.get([K_PL, K_EXPLICIT]);
        const rawU = bagU[K_PL];
        const unset =
          rawU === undefined ||
          rawU === null ||
          (typeof rawU === 'string' && !String(rawU).trim());
        // 明示選択済みプロファイルでは pending を立てない
        // （suggestInitial が幅依存の既定で明示選択を上書きする経路を断つ）。
        if (unset && bagU[K_EXPLICIT] !== true) {
          await chrome.storage.local.set({
            [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: true
          });
        }
      } catch {
        // no-op
      }
    }
    // D-4: 0.1.10 未満からの自動更新で「他人コメントへの誤焼き込み selfPosted」を剥がす。
    // 'install'（fresh）では走らないよう previousVersion を渡す。
    if (details?.reason === 'update') {
      await migrateClearStaleSelfPostedOnce(details?.previousVersion);
    }
    if (details?.reason === 'update') {
      await reloadExistingWatchTabs();
    } else {
      await injectIntoExistingTabs();
    }
    await resumeAutopatrolIfEnabled();
  })();
});

chrome.runtime.onStartup.addListener(() => {
  ensureToolbarOpensPopupNotSidePanel();
  void ensureAutoBackupAlarm();
  void migrateFloatingPanelToDockProfileOnce();
  void migrateBelowPanelToDockProfileOnce();
  void injectIntoExistingTabs();
  void resumeAutopatrolIfEnabled();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === AUTO_BACKUP_ALARM) {
    void runAutoBackupCycle();
    return;
  }
  if (alarm?.name === AUTOPATROL_ALARM) {
    void runAutopatrolTick();
  }
});

/* ================================================================== */
/* 自動巡回（Autopatrol / Phase 2b）                                          */
/*                                                                      */
/* 目的: ユーザーが配信を見ていない間も、ニコ生ランキング(公開・無認証)から      */
/*   現在放送中の lv を拾い、背景タブで 1 つずつ短時間開いて同接推定の較正データ  */
/*   を貯める。記録自体は content-entry の maybeLogConcurrentCalibrationSample   */
/*   が KEY_CONCURRENT_CALIBRATION_RING_V1 へ throttled で積む（SW は「どの配信を */
/*   開くか」のオーケストレーションだけ）。                                       */
/*                                                                      */
/* 安全側の既定:                                                          */
/*   ・既定 ON（KEY_AUTOPATROL_ENABLED が明示的に false のときだけ止まる）       */
/*   ・同時に開く巡回タブは常に 1 枚。HOLD 経過で閉じて次へ。                  */
/*   ・alarm 駆動の状態機械（alarm が rotation スケジューラ兼 SW キープアライブ）。*/
/*   ・巡回タブには #nls_autopatrol=1 を付け、content が source=autopatrol で記録。*/
/*   ・発見は公開ランキング HTML の特権 fetch + lv 正規表現抽出（API契約に非依存）。*/
/* ================================================================== */

const KEY_AUTOPATROL_ENABLED = 'nls_autopatrol_enabled_v1';
const KEY_AUTOPATROL_STATE = 'nls_autopatrol_state_v1';
const AUTOPATROL_ALARM = 'nls_autopatrol_tick';
/** alarm 周期（分）。Chrome は最小 0.5 分=30秒。古い版では 1 分に丸められても動く。 */
const AUTOPATROL_TICK_MINUTES = 0.5;
/** 1 配信を背景タブで保持する時間。content が ~30秒ごとに記録するので数サンプル取れる。 */
const AUTOPATROL_HOLD_MS = 120000;
/** queue がこの数未満になったら発見を補充する。 */
const AUTOPATROL_QUEUE_MIN = 4;
/** queue の上限（肥大防止）。 */
const AUTOPATROL_QUEUE_MAX = 200;
/** 直近に訪れた lv を覚えておく上限（すぐ再訪しないため）。 */
const AUTOPATROL_VISITED_MAX = 400;
/** 発見 fetch の最小間隔（連打で公開ページを叩かない）。 */
const AUTOPATROL_DISCOVER_MIN_INTERVAL_MS = 60000;
const AUTOPATROL_DISCOVER_TIMEOUT_MS = 8000;
const AUTOPATROL_DISCOVERY_URL = 'https://live.nicovideo.jp/ranking';
const AUTOPATROL_WATCH_BASE = 'https://live.nicovideo.jp/watch/';
const AUTOPATROL_TAB_MARK = '#nls_autopatrol=1';
const AUTOPATROL_LV_RE = /lv\d{5,12}/g;
const AUTOPATROL_LV_ONE_RE = /^lv\d{5,12}$/;

/** 同時実行ガード（alarm と storage 変更が重なっても tick を二重に走らせない）。 */
let _autopatrolTickInFlight = false;

/** @param {unknown} raw */
function normalizeAutopatrolState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const arr = (v) =>
    Array.isArray(v) ? v.filter((x) => AUTOPATROL_LV_ONE_RE.test(String(x))) : [];
  return {
    queue: arr(s.queue).slice(0, AUTOPATROL_QUEUE_MAX),
    visited: arr(s.visited).slice(-AUTOPATROL_VISITED_MAX),
    currentTabId:
      typeof s.currentTabId === 'number' && Number.isFinite(s.currentTabId)
        ? s.currentTabId
        : null,
    currentLiveId: AUTOPATROL_LV_ONE_RE.test(String(s.currentLiveId)) ? s.currentLiveId : null,
    openedAt: Math.max(0, Number(s.openedAt) || 0),
    visitedCount: Math.max(0, Number(s.visitedCount) || 0),
    lastDiscoverAt: Math.max(0, Number(s.lastDiscoverAt) || 0),
    lastError: String(s.lastError || '').slice(0, 64),
    updatedAt: Math.max(0, Number(s.updatedAt) || 0)
  };
}

async function loadAutopatrolState() {
  try {
    const bag = await chrome.storage.local.get(KEY_AUTOPATROL_STATE);
    return normalizeAutopatrolState(bag[KEY_AUTOPATROL_STATE]);
  } catch {
    return normalizeAutopatrolState(null);
  }
}

async function saveAutopatrolState(st) {
  const next = normalizeAutopatrolState(st);
  next.updatedAt = Date.now();
  try {
    await chrome.storage.local.set({ [KEY_AUTOPATROL_STATE]: next });
  } catch {
    /* no-op */
  }
}

async function getAutopatrolEnabled() {
  try {
    const bag = await chrome.storage.local.get(KEY_AUTOPATROL_ENABLED);
    // v0.1.528: 既定 ON。ユーザーが明示的に false を保存したときだけ OFF。
    //   「拡張を開いていなくても背後でデータを貯めたい」要望に対応（未設定=ON）。
    return bag[KEY_AUTOPATROL_ENABLED] !== false;
  } catch {
    // 読めないときも貯め続けたい（背景収集を止めない）＝ON 側に倒す。
    return true;
  }
}

async function ensureAutopatrolAlarm() {
  try {
    const existing = await chrome.alarms.get(AUTOPATROL_ALARM);
    if (existing) return;
    chrome.alarms.create(AUTOPATROL_ALARM, {
      delayInMinutes: AUTOPATROL_TICK_MINUTES,
      periodInMinutes: AUTOPATROL_TICK_MINUTES
    });
  } catch {
    /* no-op */
  }
}

async function clearAutopatrolAlarm() {
  try {
    await chrome.alarms.clear(AUTOPATROL_ALARM);
  } catch {
    /* no-op */
  }
}

/** 公開ランキング HTML を特権 fetch して lv を抽出（無認証・本文は SW のみ読める）。 */
async function discoverOnairLvIds() {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, AUTOPATROL_DISCOVER_TIMEOUT_MS);
  try {
    const res = await fetch(AUTOPATROL_DISCOVERY_URL, {
      method: 'GET',
      credentials: 'omit', // 匿名ランキング（偏りのない公開順位）。cookie を送らない
      cache: 'no-store',
      signal: ac.signal
    });
    if (!res || !res.ok) return [];
    const text = await res.text();
    const matches = text.match(AUTOPATROL_LV_RE) || [];
    /** @type {string[]} */
    const out = [];
    const seen = new Set();
    for (const m of matches) {
      const lv = String(m).toLowerCase();
      if (seen.has(lv)) continue;
      seen.add(lv);
      out.push(lv);
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string[]} arr Fisher–Yates シャッフル（巡回の偏りを減らす）。 */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** @param {number} tabId @returns {Promise<chrome.tabs.Tab|null>} */
async function getTabSafe(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

/** 巡回タブだけを安全に閉じる（マーカー URL を確認してユーザータブを誤爆しない）。 */
async function closeAutopatrolTab(tabId, expectLiveId) {
  if (typeof tabId !== 'number') return;
  const tab = await getTabSafe(tabId);
  if (!tab) return;
  const url = String(tab.url || tab.pendingUrl || '');
  const looksPatrol =
    url.includes('nls_autopatrol') ||
    (expectLiveId && url.includes(String(expectLiveId)));
  if (!looksPatrol) return; // 念のため: マーカーが無いタブは閉じない
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already closed */
  }
}

/** 巡回タブを背景で開く（active:false）。 */
async function openAutopatrolTab(lv) {
  const url = AUTOPATROL_WATCH_BASE + encodeURIComponent(lv) + AUTOPATROL_TAB_MARK;
  const tab = await chrome.tabs.create({ url, active: false });
  return tab && tab.id != null ? tab.id : null;
}

/**
 * 自動巡回の 1 tick（alarm / storage 変更 / 起動から呼ばれる）。
 * 1 tick = 「今開いている巡回タブの面倒を見る」or「次の配信を 1 つ開く」のどちらか。
 */
async function runAutopatrolTick() {
  if (_autopatrolTickInFlight) return;
  _autopatrolTickInFlight = true;
  try {
    const enabled = await getAutopatrolEnabled();
    const st = await loadAutopatrolState();

    if (!enabled) {
      if (st.currentTabId != null) {
        await closeAutopatrolTab(st.currentTabId, st.currentLiveId);
      }
      st.currentTabId = null;
      st.currentLiveId = null;
      st.openedAt = 0;
      await saveAutopatrolState(st);
      await clearAutopatrolAlarm();
      return;
    }

    // alarm が消えていたら張り直す（起動直後・更新後の自己回復）。
    await ensureAutopatrolAlarm();

    // 1) 既に巡回タブがあるなら、保持時間/生存を見て「待つ or 閉じる」。
    if (st.currentTabId != null) {
      const tab = await getTabSafe(st.currentTabId);
      const age = Date.now() - (st.openedAt || 0);
      if (tab && age < AUTOPATROL_HOLD_MS) {
        await saveAutopatrolState(st); // updatedAt 更新（生存ハートビート）
        return;
      }
      if (tab) await closeAutopatrolTab(st.currentTabId, st.currentLiveId);
      st.currentTabId = null;
      st.currentLiveId = null;
      st.openedAt = 0;
    }

    // 2) queue が少なければ発見で補充（公開ページを叩きすぎないよう間隔ガード）。
    const now = Date.now();
    if (
      st.queue.length < AUTOPATROL_QUEUE_MIN &&
      now - (st.lastDiscoverAt || 0) >= AUTOPATROL_DISCOVER_MIN_INTERVAL_MS
    ) {
      st.lastDiscoverAt = now;
      const ids = await discoverOnairLvIds();
      if (ids.length) {
        const visitedSet = new Set(st.visited);
        const inQueue = new Set(st.queue);
        const fresh = ids.filter((id) => !visitedSet.has(id) && !inQueue.has(id));
        shuffleInPlace(fresh);
        st.queue = st.queue.concat(fresh).slice(0, AUTOPATROL_QUEUE_MAX);
        st.lastError = st.queue.length ? '' : 'queue_empty_after_discover';
      } else {
        st.lastError = 'discover_empty';
      }
    }

    // 3) 次の配信を 1 つ開く。
    const next = st.queue.shift();
    if (!next) {
      await saveAutopatrolState(st);
      return; // 次の tick で再発見
    }
    try {
      const tabId = await openAutopatrolTab(next);
      if (tabId != null) {
        st.currentTabId = tabId;
        st.currentLiveId = next;
        st.openedAt = Date.now();
        st.visited.push(next);
        if (st.visited.length > AUTOPATROL_VISITED_MAX) {
          st.visited = st.visited.slice(-AUTOPATROL_VISITED_MAX);
        }
        st.visitedCount = (st.visitedCount || 0) + 1;
        st.lastError = '';
      } else {
        st.lastError = 'open_no_tabid';
      }
    } catch {
      st.lastError = 'open_failed';
    }
    await saveAutopatrolState(st);
  } catch {
    /* best-effort: 次の tick で立て直す */
  } finally {
    _autopatrolTickInFlight = false;
  }
}

/** 起動/更新時: トグルが ON なら巡回を再開（alarm 張り直し＋遺児タブの後始末）。 */
async function resumeAutopatrolIfEnabled() {
  try {
    if (!(await getAutopatrolEnabled())) return;
    // 前セッションの巡回タブ参照は無効（タブは消えている）。状態を綺麗にしてから再開。
    const st = await loadAutopatrolState();
    if (st.currentTabId != null) {
      await closeAutopatrolTab(st.currentTabId, st.currentLiveId);
    }
    st.currentTabId = null;
    st.currentLiveId = null;
    st.openedAt = 0;
    await saveAutopatrolState(st);
    await ensureAutopatrolAlarm();
    void runAutopatrolTick();
  } catch {
    /* no-op */
  }
}

// popup のトグル（KEY_AUTOPATROL_ENABLED の書き込み）に反応して即 ON/OFF。
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[KEY_AUTOPATROL_ENABLED]) return;
  const enabled = changes[KEY_AUTOPATROL_ENABLED].newValue === true;
  if (enabled) {
    void ensureAutopatrolAlarm();
    void runAutopatrolTick(); // すぐ 1 件目を開く
  } else {
    void runAutopatrolTick(); // OFF 後始末（巡回タブを閉じ alarm 解除）
  }
});

/* ------------------------------------------------------------------ */
/* koken 公式ギフト貢献度ランキング 無認証 API の CORS バイパス fetch proxy   */
/* content は live.nicovideo.jp origin のため API を直 fetch しても CORS で  */
/* 本文を読めない。SW の host_permissions 特権 fetch のみ本文を読める        */
/* （MV3 拡張発リクエストは Web の CORS 制約外）。content は liveId だけ送り、 */
/* URL は SW がここで固定リテラル(host/path/contributionType=gift)から自作  */
/* するので、メッセージ由来文字列で任意 URL を作らせない（SSRF 面遮断）。     */
/* 契約・正規化は src/lib/kokenContributionRankingApi.js（lib 側に契約 test）。*/
/* メモリ reference_koken_contribution_ranking_api 参照。                    */
/* ------------------------------------------------------------------ */

// src/lib/kokenContributionRankingApi.js の KOKEN_CONTRIB_FETCH_MESSAGE_TYPE と
// 文字列同期（background は ESM import 不可の手書き成果物。lib 側に契約 test）。
const KOKEN_CONTRIB_FETCH_MESSAGE_TYPE = 'NLS_KOKEN_CONTRIB_FETCH';
const KOKEN_LIVE_ID_RE = /^lv\d{1,15}$/;
const KOKEN_CONTRIB_FETCH_TIMEOUT_MS = 8000;

async function fetchKokenContribRankingJson(liveId) {
  const lid = String(liveId == null ? '' : liveId)
    .trim()
    .toLowerCase();
  if (!KOKEN_LIVE_ID_RE.test(lid)) return { ok: false };
  const url =
    'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/' +
    encodeURIComponent(lid) +
    '/ranking?rank=20';
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, KOKEN_CONTRIB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // 無認証 API。cookie を不要に送らない
      cache: 'no-store', // サーバが no-store。毎回フレッシュ
      redirect: 'error', // 想定外リダイレクトは失敗扱い（abuse 面の保守）
      // x-frontend-id/x-frontend-version ヘッダは削除済み。
      // カスタムヘッダがあると CORS preflight (OPTIONS) が必須になり、
      // niconico API が OPTIONS を返さないため preflight 失敗→CORSエラー。
      // 実機確認済み「ヘッダ全省略でも 200 を返す」ため削除で解決。
      signal: ac.signal
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 自拡張の content からのみ受理。type 不一致は他 listener / popup を妨げ
  // ないよう undefined を返して素通り（async 応答 channel も予約しない）。
  if (!msg || msg.type !== KOKEN_CONTRIB_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  // 必ず一度だけ応答（応答漏れは content 側 port を開きっぱなしにする）。
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchKokenContribRankingJson(msg.liveId)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true; // 非同期 sendResponse のため message channel を保持
});

/* ------------------------------------------------------------------ */
/* 「次の上位配信へ」: ランキング巡回を手動で1歩進める。                */
/*   status の手動ボタンから呼ばれる。autopatrol の queue/visited を    */
/*   流用し、未訪問の lv を1つ選んで現在の watch タブを置き換える       */
/*   （タブを増やさない）。watch タブが無ければ新規タブで開く。         */
/* ------------------------------------------------------------------ */
const NEXT_LIVE_REQUEST_MESSAGE_TYPE = 'NLS_NEXT_LIVE_REQUEST';

/** queue/visited から未訪問の次 lv を1つ選ぶ（excludeLv は今いる配信）。 */
function pickNextPatrolLvInState(st, candidates, excludeLv) {
  const visitedSet = new Set(st.visited);
  if (excludeLv) visitedSet.add(String(excludeLv).toLowerCase());
  const remaining = [];
  let chosen = null;
  for (const lv of st.queue) {
    if (chosen == null && !visitedSet.has(lv)) {
      chosen = lv;
      continue;
    }
    remaining.push(lv);
  }
  if (chosen == null) {
    const inQueue = new Set(remaining);
    for (const lv of candidates || []) {
      if (visitedSet.has(lv) || inQueue.has(lv)) continue;
      if (chosen == null) {
        chosen = lv;
      } else {
        remaining.push(lv);
        inQueue.add(lv);
      }
    }
  }
  st.queue = remaining.slice(0, AUTOPATROL_QUEUE_MAX);
  if (chosen) {
    st.visited = st.visited.concat([chosen]).slice(-AUTOPATROL_VISITED_MAX);
  }
  return chosen;
}

async function handleNextLiveRequest() {
  const st = await loadAutopatrolState();
  // queue が薄ければ公開ランキングから補充（叩きすぎガード付き）。
  let candidates = [];
  const now = Date.now();
  if (
    st.queue.length < AUTOPATROL_QUEUE_MIN &&
    now - (st.lastDiscoverAt || 0) >= AUTOPATROL_DISCOVER_MIN_INTERVAL_MS
  ) {
    st.lastDiscoverAt = now;
    candidates = await discoverOnairLvIds();
  }
  // 今いる watch タブ（あれば）を取得。
  let watchTab = null;
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
    });
    watchTab = Array.isArray(tabs) && tabs.length ? tabs[0] : null;
  } catch {
    /* tabs 取得失敗時は新規タブにフォールバック */
  }
  const curMatch = String(watchTab?.url || '').match(/\/watch\/(lv\d{5,12})/);
  const excludeLv = curMatch ? curMatch[1].toLowerCase() : null;

  const lv = pickNextPatrolLvInState(st, candidates, excludeLv);
  st.updatedAt = now;
  await saveAutopatrolState(st);

  if (!lv) {
    return { ok: false, reason: 'no_more_lives' };
  }
  const url = AUTOPATROL_WATCH_BASE + lv;
  try {
    if (watchTab && watchTab.id != null) {
      await chrome.tabs.update(watchTab.id, { url, active: true });
    } else {
      await chrome.tabs.create({ url, active: true });
    }
    return { ok: true, lv };
  } catch (err) {
    return { ok: false, reason: 'navigate_failed', error: String(err && err.message) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== NEXT_LIVE_REQUEST_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port closed */
    }
  };
  handleNextLiveRequest()
    .then(reply)
    .catch((err) => reply({ ok: false, reason: 'internal', error: String(err && err.message) }));
  return true; // 非同期 sendResponse
});

/* ------------------------------------------------------------------ */
/* v0.1.716: 会場モード(content script)から「コメビュを開く」要求を受けて、SW が  */
/*   comeview.html を別ウィンドウ popup で開く。content script は chrome.windows を  */
/*   直接呼べない(会議 Codex 指摘)ので SW 経由。status.html の btnComeview と同型。 */
/*   ?lv= を付けて配信を固定(comeview 側は無指定なら nls_last_watch_url で自己解決)。*/
/* ------------------------------------------------------------------ */
const OPEN_COMEVIEW_MESSAGE_TYPE = 'NLS_OPEN_COMEVIEW';
const COMEVIEW_LV_RE = /^lv\d{1,15}$/;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== OPEN_COMEVIEW_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  const reply = (v) => {
    try {
      sendResponse(v);
    } catch {
      /* port closed */
    }
  };
  // lv は content から渡る生値。固定リテラル path に正規化済み lv だけ載せる(injection 面遮断)。
  const lv = COMEVIEW_LV_RE.test(String(msg.liveId || '')) ? String(msg.liveId) : '';
  const base = chrome.runtime.getURL('comeview.html');
  const url = lv ? `${base}?lv=${lv}` : base;
  (async () => {
    try {
      await chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: String(err && err.message) });
    }
  })();
  return true; // 非同期 sendResponse
});

const OPEN_VENUE_MESSAGE_TYPE = 'NLS_OPEN_VENUE';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== OPEN_VENUE_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  const reply = (v) => {
    try {
      sendResponse(v);
    } catch {
      /* port closed */
    }
  };
  const lv = COMEVIEW_LV_RE.test(String(msg.liveId || '')) ? String(msg.liveId) : '';
  const base = chrome.runtime.getURL('venue.html');
  const url = lv ? `${base}?lv=${lv}` : base;
  (async () => {
    try {
      // 映像セーフエリア＋ひな壇を確保するため、少し広めのウィンドウで開く
      await chrome.windows.create({ url, type: 'popup', width: 1000, height: 720 });
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: String(err && err.message) });
    }
  })();
  return true; // 非同期 sendResponse
});

/* ------------------------------------------------------------------ */
/* nicoad（ニコニ広告）貢献度ランキング 無認証 API の CORS バイパス fetch proxy   */
/* koken と同型。広告ランキングは従来 HTML scrape で取得していたが DOM に uid が   */
/* 出ず、記名広告主のアカウントリンク/アバターが付かなかった。本 API は記名行に    */
/* userId/userPageUrl を返す（無認証・2026-05-23 実機確証）。content は liveId だけ */
/* 送り、URL は SW がここで固定リテラル(host/path/limit)から自作する（SSRF面遮断）。*/
/* 契約・正規化は src/lib/nicoadContributionRankingApi.js（lib 側に契約 test）。    */
/* ------------------------------------------------------------------ */

// src/lib/nicoadContributionRankingApi.js の NICOAD_CONTRIB_FETCH_MESSAGE_TYPE と
// NICOAD_CONTRIB_DEFAULT_LIMIT に文字列/数値同期（background は ESM import 不可の
// 手書き成果物。lib 側に契約 test）。
const NICOAD_CONTRIB_FETCH_MESSAGE_TYPE = 'NLS_NICOAD_CONTRIB_FETCH';
const NICOAD_LIVE_ID_RE = /^lv\d{1,15}$/;
const NICOAD_CONTRIB_FETCH_TIMEOUT_MS = 8000;
const NICOAD_CONTRIB_DEFAULT_LIMIT = 10;

async function fetchNicoadContribRankingJson(liveId) {
  const lid = String(liveId == null ? '' : liveId)
    .trim()
    .toLowerCase();
  if (!NICOAD_LIVE_ID_RE.test(lid)) return { ok: false };
  const url =
    'https://api.nicoad.nicovideo.jp/v1/contents/live/' +
    encodeURIComponent(lid) +
    '/ranking/contribution?limit=' +
    NICOAD_CONTRIB_DEFAULT_LIMIT;
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, NICOAD_CONTRIB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // 無認証 API。cookie を不要に送らない
      cache: 'no-store',
      redirect: 'error',
      // x-frontend-id/x-frontend-version ヘッダは削除済み（koken と同じ理由）。
      signal: ac.signal
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== NICOAD_CONTRIB_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchNicoadContribRankingJson(msg.liveId)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true; // 非同期 sendResponse のため message channel を保持
});

/* ------------------------------------------------------------------ */
/* 企画イベント「参加番組一覧」公式 API の CORS バイパス fetch proxy           */
/* 第2弾「同じイベントに参加している他の配信者」。koken/nicoad と同型。         */
/* この API は無認証で本文が取れる（2026-05-25 実機 event472 で確証）が、       */
/* ブラウザ content/MAIN world からの fetch は CORS で全滅＝本文を読めるのは     */
/* host_permissions 特権を持つ SW のみ。content は planningEventId(数値)だけ     */
/* 送り、URL は SW が固定 host/path から自作する（SSRF面遮断）。               */
/* 契約・正規化は src/lib/eventParticipationProgramsApi.js（lib 側に契約 test）。*/
/* ------------------------------------------------------------------ */

// src/lib/eventParticipationProgramsApi.js の EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE
// と文字列同期（background は ESM import 不可の手書き成果物。lib 側に契約 test）。
const EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE = 'NLS_EVENT_PARTICIPATION_FETCH';
const EVENT_PARTICIPATION_ID_RE = /^[1-9]\d{0,17}$/;
const EVENT_PARTICIPATION_FETCH_TIMEOUT_MS = 8000;

async function fetchEventParticipationJson(planningEventId) {
  const id = String(planningEventId == null ? '' : planningEventId).trim();
  if (!EVENT_PARTICIPATION_ID_RE.test(id)) return { ok: false };
  const url =
    'https://api.live2.nicovideo.jp/api/v1/planning-event/participation-programs?planningEventId=' +
    encodeURIComponent(id);
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, EVENT_PARTICIPATION_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // 無認証で本文が取れる API。cookie を不要に送らない
      cache: 'no-store',
      redirect: 'error',
      // x-frontend-id/x-frontend-version ヘッダは削除済み（koken/nicoad と同じ理由）。
      signal: ac.signal
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchEventParticipationJson(msg.planningEventId)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true; // 非同期 sendResponse のため message channel を保持
});

/* ------------------------------------------------------------------ */
/* koken ギフト履歴（個別イベント）無認証 API の CORS バイパス fetch proxy        */
/* 「ギフト履歴もすぐとりたい」（2026-06-01）: 従来は koken iframe のサイドバー DOM */
/* を開いたときだけ scrape できた gift-history-list を、無認証 capi から即時取得    */
/* する。koken 貢献度ランキングと同 namespace の /histories（実機で無認証200を確証）。*/
/* content は liveId だけ送り、URL は SW が固定 host/path から自作する（SSRF面遮断）。*/
/* 契約・正規化は src/lib/kokenGiftHistoryApi.js（lib 側に契約 test）。            */
/* ------------------------------------------------------------------ */

// src/lib/kokenGiftHistoryApi.js の KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE と文字列同期。
const KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE = 'NLS_KOKEN_GIFT_HISTORY_FETCH';
const KOKEN_GIFT_HISTORY_LIVE_ID_RE = /^lv\d{1,15}$/;
const KOKEN_GIFT_HISTORY_FETCH_TIMEOUT_MS = 8000;

async function fetchKokenGiftHistoryJson(liveId, nextCursor) {
  const lid = String(liveId == null ? '' : liveId)
    .trim()
    .toLowerCase();
  if (!KOKEN_GIFT_HISTORY_LIVE_ID_RE.test(lid)) return { ok: false };
  let url =
    'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/' +
    encodeURIComponent(lid) +
    '/histories';
  const cursor =
    nextCursor != null && Number.isFinite(Number(nextCursor)) && Number(nextCursor) > 0
      ? Math.floor(Number(nextCursor))
      : null;
  if (cursor != null) {
    url += '?nextCount=' + encodeURIComponent(String(cursor));
  }
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, KOKEN_GIFT_HISTORY_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // 無認証で本文が取れる API。
      cache: 'no-store',
      redirect: 'error',
      signal: ac.signal
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchKokenGiftHistoryJson(msg.liveId, msg.nextCursor)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true; // 非同期 sendResponse のため message channel を保持
});

/* ------------------------------------------------------------------ */
/* audition イベント💎ランキング 無認証 API の CORS バイパス fetch proxy（2段）   */
/* 「対象の場所をひらかないとでない」（2026-06-01）: richview iframe を mount せずに */
/* イベント💎ランキングを即時取得する。SW が liveId から (1) entry_items を引いて   */
/* audition.key を取り、(2) rankings を引く 2 段 fetch を行う。key は厳格 regex で   */
/* 検証してから rankings URL を組む（任意文字列 fetch=SSRF 防止）。実機で無認証200。 */
/* 契約・正規化は src/lib/auditionEventRankingApi.js（lib 側に契約 test）。        */
/* ------------------------------------------------------------------ */

// src/lib/auditionEventRankingApi.js の AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE /
// AUDITION_KEY_RE と文字列/正規表現同期（background は ESM import 不可の手書き成果物）。
const AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE = 'NLS_AUDITION_EVENT_RANKING_FETCH';
const AUDITION_EVENT_LIVE_ID_RE = /^lv\d{1,15}$/;
const AUDITION_EVENT_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,80}$/i;
const AUDITION_EVENT_POSITIVE_INT_RE = /^[1-9]\d{0,17}$/;
const AUDITION_EVENT_FETCH_TIMEOUT_MS = 8000;

async function fetchAuditionJsonOnce(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, AUDITION_EVENT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // 無認証で本文が取れる capi。
      cache: 'no-store',
      redirect: 'error',
      signal: ac.signal
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, json: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAuditionEventRankingJson(liveId) {
  const lid = String(liveId == null ? '' : liveId)
    .trim()
    .toLowerCase();
  if (!AUDITION_EVENT_LIVE_ID_RE.test(lid)) return { ok: false };

  // (1) entry_items: live → audition.key
  const entryUrl =
    'https://audition.nicovideo.jp/capi/v1/entry_items?item_type=live&item_id=' +
    encodeURIComponent(lid) +
    '&include_owner_items=true&expose_platform=live';
  const entry = await fetchAuditionJsonOnce(entryUrl);
  if (!entry.ok || entry.json == null) return { ok: false };

  // audition.key / entry_item id を取り出して厳格検証（SSRF 面遮断）。
  let auditionKey = '';
  let entryId = '';
  try {
    const items =
      entry.json && entry.json.data && Array.isArray(entry.json.data.entry_items)
        ? entry.json.data.entry_items
        : null;
    const e0 = items && items.length ? items[0] : null;
    const k = e0 && e0.audition ? String(e0.audition.key || '').trim() : '';
    if (AUDITION_EVENT_KEY_RE.test(k)) auditionKey = k;
    const idStr = e0 ? String(e0.id == null ? '' : e0.id).trim() : '';
    if (AUDITION_EVENT_POSITIVE_INT_RE.test(idStr)) entryId = idStr;
  } catch {
    auditionKey = '';
    entryId = '';
  }
  // 非イベント（entry_items 空 / key 無し）は rankings を引かず entry のみ返す。
  if (!auditionKey) {
    return { ok: true, entryItemsJson: entry.json, rankingsJson: null, votingJson: null };
  }

  // (2) rankings: audition 全体の💎順位、(3) voting_user_ranking: 応援者（投票）順
  //     entryId があれば応援者ランキングも並行取得（無ければ rankings のみ）。
  const rankUrl =
    'https://audition.nicovideo.jp/capi/v1/auditions/' +
    encodeURIComponent(auditionKey) +
    '/rankings?limit=25';
  const votingUrl = entryId
    ? 'https://audition.nicovideo.jp/capi/v1/entry_items/' +
      encodeURIComponent(entryId) +
      '/voting_user_ranking?limit=20'
    : null;
  const [rank, voting] = await Promise.all([
    fetchAuditionJsonOnce(rankUrl),
    votingUrl ? fetchAuditionJsonOnce(votingUrl) : Promise.resolve({ ok: false, json: null })
  ]);
  return {
    ok: true,
    entryItemsJson: entry.json,
    rankingsJson: rank.ok ? rank.json : null,
    votingJson: voting.ok ? voting.json : null
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchAuditionEventRankingJson(msg.liveId)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true; // 非同期 sendResponse のため message channel を保持
});

/* ------------------------------------------------------------------ */
/* ニコニコ ユーザープロフィール 無認証 API の CORS バイパス fetch proxy        */
/* 記名 uid から nickname + 個人サムネを引き、既存 profile cache に反映する。  */
/* content は uid だけ送り、URL は SW が固定 host/path から自作する。          */
/* 契約・正規化は src/lib/nicoUserProfileApi.js（lib 側に契約 test）。        */
/* ------------------------------------------------------------------ */

// src/lib/nicoUserProfileApi.js の NICO_USER_PROFILE_FETCH_MESSAGE_TYPE と文字列同期。
const NICO_USER_PROFILE_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_PROFILE_FETCH';
const NICO_USER_PROFILE_UID_RE = /^\d{1,18}$/;
const NICO_USER_PROFILE_FETCH_TIMEOUT_MS = 8000;
const NICO_USER_PROFILE_LRU_MAX = 512;
const NICO_USER_PROFILE_LRU_TTL_MS = 10 * 60 * 1000;
/** @type {Map<string, number>} */
const _nicoUserProfileLru = new Map();

function _nicoUserProfileLruShouldSkip(uid, now) {
  const at = _nicoUserProfileLru.get(uid);
  return at != null && now - at < NICO_USER_PROFILE_LRU_TTL_MS;
}

function _nicoUserProfileLruNote(uid, now) {
  if (_nicoUserProfileLru.has(uid)) _nicoUserProfileLru.delete(uid);
  _nicoUserProfileLru.set(uid, now);
  while (_nicoUserProfileLru.size > NICO_USER_PROFILE_LRU_MAX) {
    const oldest = _nicoUserProfileLru.keys().next().value;
    if (oldest === undefined) break;
    _nicoUserProfileLru.delete(oldest);
  }
}

async function fetchNicoUserProfileJson(uid) {
  const id = String(uid == null ? '' : uid).trim();
  if (!NICO_USER_PROFILE_UID_RE.test(id) || Number(id) <= 0) return { ok: false };
  const now = Date.now();
  if (_nicoUserProfileLruShouldSkip(id, now)) return { ok: false, skipped: true };
  _nicoUserProfileLruNote(id, now);
  const url = 'https://nvapi.nicovideo.jp/v1/users/' + encodeURIComponent(id);
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, NICO_USER_PROFILE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      // x-frontend-id/x-frontend-version ヘッダは削除済み（koken/nicoad と同じ理由）。
      signal: ac.signal
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== NICO_USER_PROFILE_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchNicoUserProfileJson(msg.uid)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true;
});

/* ------------------------------------------------------------------ */
/* コメンター フォロー一覧 nvapi（非公式・Cookie 必須）                          */
/* src/lib/nicoUserFollowingApi.js の NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE 同期 */
/* ------------------------------------------------------------------ */

const NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_FOLLOWING_FETCH';
const NICO_USER_FOLLOWING_FETCH_TIMEOUT_MS = 12_000;
const NICO_USER_FOLLOWING_LRU_MAX = 64;
const NICO_USER_FOLLOWING_LRU_TTL_MS = 10 * 60 * 1000;
const NICO_USER_FOLLOWING_PAGE_SIZE = 100;
const NICO_USER_FOLLOWING_MAX_PAGES = 2;
const NICO_USER_FOLLOWING_MAX_USER_IDS = 200;
/** @type {Map<string, number>} */
const _nicoUserFollowingLru = new Map();

function _nicoUserFollowingLruShouldSkip(uid, now) {
  const at = _nicoUserFollowingLru.get(uid);
  return at != null && now - at < NICO_USER_FOLLOWING_LRU_TTL_MS;
}

function _nicoUserFollowingLruNote(uid, now) {
  if (_nicoUserFollowingLru.has(uid)) _nicoUserFollowingLru.delete(uid);
  _nicoUserFollowingLru.set(uid, now);
  while (_nicoUserFollowingLru.size > NICO_USER_FOLLOWING_LRU_MAX) {
    const oldest = _nicoUserFollowingLru.keys().next().value;
    if (oldest === undefined) break;
    _nicoUserFollowingLru.delete(oldest);
  }
}

function _buildNicoUserFollowingListUrl(uid, page) {
  const params = new URLSearchParams();
  params.set('pageSize', String(NICO_USER_FOLLOWING_PAGE_SIZE));
  if (page > 1) params.set('page', String(page));
  return (
    'https://nvapi.nicovideo.jp/v1/users/' +
    encodeURIComponent(uid) +
    '/following/users?' +
    params.toString()
  );
}

/**
 * @param {unknown} item
 * @returns {string|null}
 */
function _extractFollowingUserId(item) {
  if (item == null) return null;
  if (typeof item === 'number' || typeof item === 'string') {
    const s = String(item).trim();
    return NICO_USER_PROFILE_UID_RE.test(s) && Number(s) > 0 ? s : null;
  }
  if (typeof item === 'object' && !Array.isArray(item)) {
    const o = /** @type {Record<string, unknown>} */ (item);
    return _extractFollowingUserId(o.id ?? o.userId);
  }
  return null;
}

/**
 * @param {unknown} json
 * @returns {{ userIds: string[], totalCount?: number, hasMore: boolean, pageCount: number }|null}
 */
function _normalizeFollowingListAggregate(json) {
  if (!json || typeof json !== 'object') return null;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && Number(j.meta.status) !== 200) return null;
  const data = j.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return null;
  /** @type {string[]} */
  const userIds = [];
  const seen = new Set();
  for (const item of data.items) {
    const uid = _extractFollowingUserId(item);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    userIds.push(uid);
  }
  const totalCount = Number(data.totalCount ?? data.total ?? data.count);
  const nextPage = Number(data.nextPage);
  const hasMore =
    (Number.isFinite(nextPage) && nextPage > 0) ||
    (Number.isFinite(totalCount) && totalCount > userIds.length && data.items.length > 0);
  /** @type {{ userIds: string[], totalCount?: number, hasMore: boolean, pageCount: number }} */
  const out = { userIds, hasMore, pageCount: 1 };
  if (Number.isFinite(totalCount) && totalCount >= 0) out.totalCount = Math.floor(totalCount);
  return out;
}

/**
 * @param {number} status
 * @returns {'login_required'|'forbidden'|'error'}
 */
function _classifyFollowingFetchFailure(status) {
  const code = Number(status);
  if (code === 401) return 'login_required';
  if (code === 403 || code === 404) return 'forbidden';
  return 'error';
}

async function fetchNicoUserFollowingListJson(uid) {
  const id = String(uid == null ? '' : uid).trim();
  if (!NICO_USER_PROFILE_UID_RE.test(id) || Number(id) <= 0) return { ok: false };
  const now = Date.now();
  if (_nicoUserFollowingLruShouldSkip(id, now)) return { ok: false, skipped: true };
  _nicoUserFollowingLruNote(id, now);

  /** @type {string[]} */
  const allIds = [];
  const seen = new Set();
  let totalCount;
  let pageCount = 0;
  let lastStatus = 0;

  for (let page = 1; page <= NICO_USER_FOLLOWING_MAX_PAGES; page += 1) {
    const url = _buildNicoUserFollowingListUrl(id, page);
    const ac = new AbortController();
    const timer = setTimeout(() => {
      try {
        ac.abort();
      } catch {
        /* no-op */
      }
    }, NICO_USER_FOLLOWING_FETCH_TIMEOUT_MS);
    let res;
    let json = null;
    try {
      res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: { Referer: 'https://www.nicovideo.jp/' },
        signal: ac.signal
      });
      lastStatus = res.status;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    } catch {
      return { ok: false, followingStatus: 'error' };
    } finally {
      clearTimeout(timer);
    }

    const metaStatus =
      json && typeof json === 'object' && json.meta != null
        ? Number(/** @type {Record<string, unknown>} */ (json).meta?.status)
        : NaN;
    if (Number.isFinite(metaStatus) && metaStatus !== 200) {
      return {
        ok: false,
        status: metaStatus,
        followingStatus: _classifyFollowingFetchFailure(metaStatus)
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: lastStatus,
        followingStatus: _classifyFollowingFetchFailure(lastStatus)
      };
    }

    const normalized = _normalizeFollowingListAggregate(json);
    if (!normalized) {
      return { ok: false, status: lastStatus, followingStatus: 'error' };
    }
    pageCount += 1;
    if (totalCount == null && normalized.totalCount != null) totalCount = normalized.totalCount;
    for (const followUid of normalized.userIds) {
      if (seen.has(followUid)) continue;
      seen.add(followUid);
      allIds.push(followUid);
      if (allIds.length >= NICO_USER_FOLLOWING_MAX_USER_IDS) break;
    }
    const truncated = allIds.length >= NICO_USER_FOLLOWING_MAX_USER_IDS;
    if (truncated || !normalized.hasMore || page >= NICO_USER_FOLLOWING_MAX_PAGES) {
      return {
        ok: true,
        status: lastStatus,
        followingStatus: 'ok',
        userIds: allIds,
        totalCount,
        truncated,
        pageCount
      };
    }
  }

  return {
    ok: true,
    status: lastStatus,
    followingStatus: 'ok',
    userIds: allIds,
    totalCount,
    truncated: allIds.length >= NICO_USER_FOLLOWING_MAX_USER_IDS,
    pageCount
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed */
    }
  };
  fetchNicoUserFollowingListJson(msg.uid)
    .then(reply)
    .catch(() => reply({ ok: false, followingStatus: 'error' }));
  return true;
});

// --- 配信者プロフィール HTML ページ取得（LV/プレミアム/フォロー/欲しいものリスト解析用）---
// src/lib/nicoUserProfileApi.js の NICO_USER_PROFILE_PAGE_FETCH_MESSAGE_TYPE と文字列同期。
const NICO_USER_PROFILE_PAGE_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_PROFILE_PAGE_FETCH';
const NICO_USER_PROFILE_PAGE_MAX_BYTES = 2_500_000;
const NICO_USER_PROFILE_PAGE_LRU_TTL_MS = 30 * 60 * 1000;
/** @type {Map<string, number>} */
const _nicoUserProfilePageLru = new Map();

async function fetchNicoUserProfilePageHtml(uid) {
  const id = String(uid == null ? '' : uid).trim();
  // SSRF 対策: 正の数値 uid のみ。URL の path 以外は固定。
  if (!NICO_USER_PROFILE_UID_RE.test(id) || Number(id) <= 0) return { ok: false };
  const now = Date.now();
  const at = _nicoUserProfilePageLru.get(id);
  if (at != null && now - at < NICO_USER_PROFILE_PAGE_LRU_TTL_MS) {
    return { ok: false, skipped: true };
  }
  if (_nicoUserProfilePageLru.has(id)) _nicoUserProfilePageLru.delete(id);
  _nicoUserProfilePageLru.set(id, now);
  while (_nicoUserProfilePageLru.size > NICO_USER_PROFILE_LRU_MAX) {
    const oldest = _nicoUserProfilePageLru.keys().next().value;
    if (oldest === undefined) break;
    _nicoUserProfilePageLru.delete(oldest);
  }
  const url = 'https://www.nicovideo.jp/user/' + encodeURIComponent(id);
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, NICO_USER_PROFILE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: ac.signal
    });
    let html = '';
    try {
      html = await res.text();
    } catch {
      html = '';
    }
    if (html.length > NICO_USER_PROFILE_PAGE_MAX_BYTES) {
      html = html.slice(0, NICO_USER_PROFILE_PAGE_MAX_BYTES);
    }
    return { ok: res.ok, status: res.status, html, finalUrl: res.url || url };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== NICO_USER_PROFILE_PAGE_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchNicoUserProfilePageHtml(msg.uid)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true;
});

/* ------------------------------------------------------------------ */
/* 配信者の評判チェック: Google サジェスト取得の CORS バイパス fetch proxy        */
/* (PR R2・[[reference_broadcaster_reputation_check_from_dns_osint]])           */
/* suggestqueries.google.com は CORS フリーで JSON を返すが、content/popup から  */
/* の直 fetch は将来の CSP/CORS 変更に弱い → host_permissions 特権の SW で取得。  */
/* content/popup は query(文字列)だけ送り、URL は SW が固定 host/path から自作    */
/* (SSRF面遮断)。契約・正規化は src/lib/googleSuggest.js（lib 側に契約 test）。   */
/* 取得結果のネガ判定は src/lib/broadcasterReputationKeywords.js（呼び出し側）。 */
/* ------------------------------------------------------------------ */

// src/lib/googleSuggest.js の GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE / 定数と文字列同期
// （background は ESM import 不可の手書き成果物。lib 側に契約 test）。
const GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE = 'NLS_GOOGLE_SUGGEST_FETCH';
const GOOGLE_SUGGEST_MAX_QUERY_LEN = 100;
const GOOGLE_SUGGEST_FETCH_TIMEOUT_MS = 6000;

async function fetchGoogleSuggestJson(query) {
  const q = String(query == null ? '' : query).trim();
  if (q.length < 1 || q.length > GOOGLE_SUGGEST_MAX_QUERY_LEN) return { ok: false };
  // 固定 host/path + encodeURIComponent でクエリだけ可変（SSRF面遮断）
  const url =
    'https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=' +
    encodeURIComponent(q);
  const ac = new AbortController();
  const timer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      /* no-op */
    }
  }, GOOGLE_SUGGEST_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // 認証不要の公開サジェスト。cookie を送らない
      cache: 'no-store',
      signal: ac.signal
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  let answered = false;
  const reply = (v) => {
    if (answered) return;
    answered = true;
    try {
      sendResponse(v);
    } catch {
      /* port already closed: best-effort */
    }
  };
  fetchGoogleSuggestJson(msg.query)
    .then(reply)
    .catch(() => reply({ ok: false }));
  return true; // 非同期 sendResponse のため message channel を保持
});

/* ------------------------------------------------------------------ */
/* ツールバー: ページ内インラインがあれば前面化、なければ popup 窓（src/lib/uiUxOpenStrategy と整合） */
/* ------------------------------------------------------------------ */

const KEY_TOOLBAR_ACTION_POLICY = 'nls_toolbar_action_policy';

/** メモリキャッシュ（ツールバー連打時の storage 往復を削る）。storage 変更で無効化。 */
let __toolbarActionPolicyMem = /** @type {'prefer_focus_inline' | 'always_open_popup' | null} */ (
  null
);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[KEY_TOOLBAR_ACTION_POLICY]) return;
  __toolbarActionPolicyMem = null;
});

/**
 * @returns {'prefer_focus_inline' | 'always_open_popup'}
 */
async function getToolbarActionPolicy() {
  if (__toolbarActionPolicyMem != null) return __toolbarActionPolicyMem;
  try {
    const bag = await chrome.storage.local.get(KEY_TOOLBAR_ACTION_POLICY);
    const v = String(bag[KEY_TOOLBAR_ACTION_POLICY] || '').trim();
    const out = v === 'always_open_popup' ? 'always_open_popup' : 'prefer_focus_inline';
    __toolbarActionPolicyMem = out;
    return out;
  } catch {
    __toolbarActionPolicyMem = 'prefer_focus_inline';
    return 'prefer_focus_inline';
  }
}

/**
 * この拡張のページを載せた `type: 'popup'` をすべて閉じる。
 * 0.1.269: 空タブ等で連打したあと URL が `popup.html` と完全一致しなくても
 *   `chrome-extension://<id>/` なら掃除対象にする（孤児 popup が残り
 *   `windows.create` が失敗して「配信画面で押しても開かない」に繋がるのを抑止）。
 */
async function closeAllOurExtensionPopupWindows() {
  const extPrefix = `chrome-extension://${chrome.runtime.id}/`;
  try {
    const all = await chrome.windows.getAll({ populate: true });
    for (const w of all) {
      if (w.type !== 'popup' || w.id == null) continue;
      const tabs = w.tabs || [];
      let ours = false;
      for (const t of tabs) {
        const u = String(t?.pendingUrl || t?.url || '');
        if (u.startsWith(extPrefix)) {
          const base = u.split('?')[0].split('#')[0];
          // 独立ウィンドウ(venue/comeview/status)は孤児掃除から保護する。
          const isStandalone = 
            base === chrome.runtime.getURL('venue.html') ||
            base === chrome.runtime.getURL('comeview.html') ||
            base === chrome.runtime.getURL('status.html');
          if (!isStandalone) {
            ours = true;
          }
          break;
        }
      }
      if (!ours) continue;
      try {
        await chrome.windows.remove(w.id);
      } catch {
        // already closed
      }
    }
  } catch {
    // no-op
  }
}

/**
 * v0.1.603: ツールバー再クリックで「既存 popup を毎回閉じて開き直す」体感
 *   （閉じる→空白→再オープン→数字無いPOP→数字戻る、のチカチカ）を解消する。
 *
 * 戦略:
 *   - 当拡張の popup.html を正しく載せている既存窓があれば、それを focus + サイズ補正
 *     して再利用。中身の state（取得済みデータ・スクロール位置）は壊さない。
 *   - 同時に「孤児 popup」（chrome-extension URL だが popup.html ではないもの）は
 *     掃除する。0.1.269 で観測された「孤児が残ると create が黙殺される」対策を維持。
 *   - 戻り値:
 *     - true ... 既存窓を再利用済み（呼び出し側は windows.create をスキップして良い）
 *     - false ... 再利用先が無い（呼び出し側は通常通り create する）
 *
 * @returns {Promise<boolean>}
 */
async function focusOurExtensionPopupOrCleanupOrphans() {
  const popupUrlExact = chrome.runtime.getURL('popup.html');
  const extPrefix = `chrome-extension://${chrome.runtime.id}/`;
  let reused = false;
  try {
    const all = await chrome.windows.getAll({ populate: true });
    for (const w of all) {
      if (w.type !== 'popup' || w.id == null) continue;
      const tabs = w.tabs || [];
      let hostsPopupHtml = false;
      let hostsOurExt = false;
      let hostsStandalone = false;
      for (const t of tabs) {
        const u = String(t?.pendingUrl || t?.url || '');
        if (!u.startsWith(extPrefix)) continue;
        hostsOurExt = true;
        // クエリ・ハッシュ等を許容しつつ popup.html かどうか判定
        const base = u.split('?')[0].split('#')[0];
        if (base === popupUrlExact) {
          hostsPopupHtml = true;
          break;
        }
        const isStandalone = 
          base === chrome.runtime.getURL('venue.html') ||
          base === chrome.runtime.getURL('comeview.html') ||
          base === chrome.runtime.getURL('status.html');
        if (isStandalone) {
          hostsStandalone = true;
          break;
        }
      }
      if (!hostsOurExt) continue;
      // 独立ウィンドウはシングルトン管理の対象外として無視(閉じない/updateしない)
      if (hostsStandalone) continue;
      if (hostsPopupHtml && !reused) {
        // 正常な popup を 1 つだけ再利用（複数あれば 2 つ目以降は孤児扱いで掃除）
        try {
          await chrome.windows.update(w.id, {
            width: POPUP_WINDOW_WIDTH,
            height: POPUP_WINDOW_HEIGHT,
            focused: true,
            state: 'normal'
          });
          reused = true;
          continue;
        } catch {
          // update 失敗時は孤児扱いで閉じる
        }
      }
      // 孤児（popup.html ではない、あるいは update に失敗した重複窓）は掃除
      try {
        await chrome.windows.remove(w.id);
      } catch {
        // already closed
      }
    }
  } catch {
    // no-op: 取得失敗時は false を返して通常 create に任せる
  }
  return reused;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 既存の popup 窓があれば前面化、なければ作成（default_popup 廃止後の代替）。
 *
 * 0.1.58 (AN) → 0.1.59 (AO): popup window のサイズを毎回 420×780 に
 *   リセットするだけでなく、Chrome が以前の resize を強く保持する
 *   ケースに対処するため、既存 popup を **閉じてから** 新規作成する形に
 *   変更。フォーカス継続は失われるが、サイズが必ず 420×780 になる。
 *   さらに `state: 'normal'` を明示して maximized 等の異常状態を解除し、
 *   `top`/`left` を画面中央寄せに。
 *
 * 0.1.269: 連打・複数孤児窓で `create` が黙殺されるのを防ぐため、
 *   当拡張の chrome-extension URL を載せる popup はすべて閉じ、
 *   操作を直列化し、create 失敗時は掃除のうえ 1 回だけ再試行する。
 */
const POPUP_WINDOW_WIDTH = 420;
const POPUP_WINDOW_HEIGHT = 780;

/** @type {Promise<void>} */
let _openPopupWindowChain = Promise.resolve();

/**
 * @param {number|undefined} anchorWindowId ツールバーを押したタブの所属ウィンドウ。
 *   未指定時は getLastFocused にフォールバック（複数の通常ウィンドウが開いていて
 *   「配信を見ているウィンドウ」と最後フォーカスウィンドウがずれると、popup が
 *   別ウィンドウ側に出て「押しても開かない」と誤認されやすい）。
 */
async function openOrFocusPopupWindow(anchorWindowId) {
  const run = async () => {
    try {
      await doOpenOrFocusPopupWindow(anchorWindowId, false);
    } catch {
      await sleep(150);
      try {
        await doOpenOrFocusPopupWindow(anchorWindowId, true);
      } catch {
        /* 最終手段でも失敗時は諦める（無限ループしない） */
      }
    }
  };
  const job = _openPopupWindowChain.then(run);
  _openPopupWindowChain = job.catch(() => {});
  // job 自体が reject しうるので、ここでも握りつぶして handler 側の未処理拒否を防ぐ
  await job.catch(() => {});
}

/**
 * @param {number|undefined} anchorWindowId
 * @param {boolean} stripPositionHints create が座標だけで連続失敗するとき用最小幅の opts
 */
async function doOpenOrFocusPopupWindow(anchorWindowId, stripPositionHints) {
  const url = chrome.runtime.getURL('popup.html');
  // v0.1.603: 正常な popup が既に開いていれば閉じずに focus + サイズ補正で再利用。
  //   孤児（chrome-extension URL だが popup.html でない窓・重複窓）は掃除する。
  //   再利用できた場合は windows.create をスキップ＝中身の取得済みデータが保たれ、
  //   ユーザーが見た「閉じる→数字無いPOP→数字戻る」のチカチカが解消される。
  if (await focusOurExtensionPopupOrCleanupOrphans()) {
    return;
  }
  await sleep(70);
  /*
   * 0.1.61 (AQ) → 0.1.62 (AR) → 0.1.64 (AT3): popup を Chrome window の
   *   「右内側」に配置する。
   *
   *   経緯:
   *     0.1.62 では Chrome の右**外**側 (left = lastNormal.left + width) に
   *     置いていた。Chrome がモニタ A の右寄りにいると、外側＝モニタ B
   *     （隣のモニタ）になる。多モニタ環境（5 モニタ等）では popup が別の
   *     モニタに飛んでしまう報告。
   *   修正:
   *     popup の left を「Chrome の右端 - POPUP_WIDTH」にし、Chrome window の
   *     **内側**右上に出す。Chrome content の右側と少し被るが、必ず Chrome の
   *     いるモニタに popup が出るので「別モニタに飛ぶ」事故を完全に防げる。
   *     ユーザー要望「Chrome から離れて出るのはおかしい」（=右側に並べたい）の
   *     趣旨も保つ。
   *     Chrome window が POPUP_WIDTH より狭い極端ケースでは window 全体に
   *     被るが、その場合は元々が異常状態なので無視（左端を超えない clamp で
   *     十分）。
   */
  /** @type {{ left?: number, top?: number }} */
  const positionHint = {};
  try {
    /** @type {chrome.windows.Window|undefined} */
    let anchor =
      typeof anchorWindowId === 'number' && Number.isFinite(anchorWindowId)
        ? await chrome.windows.get(anchorWindowId).catch(() => undefined)
        : undefined;
    if (
      !anchor ||
      (anchor.type !== 'normal' &&
        anchor.type !== 'maximized' &&
        anchor.type !== 'fullscreen')
    ) {
      anchor = await chrome.windows.getLastFocused({
        windowTypes: ['normal']
      });
    }
    if (
      anchor &&
      typeof anchor.left === 'number' &&
      typeof anchor.top === 'number' &&
      typeof anchor.width === 'number'
    ) {
      // Chrome window の右**内側**に popup の右端を合わせる（content の右側と被るが必ず同モニタ）
      const left = anchor.left + anchor.width - POPUP_WINDOW_WIDTH;
      const top = anchor.top;
      positionHint.left = Math.max(anchor.left, Math.round(left));
      positionHint.top = Math.max(0, Math.round(top));
    }
  } catch {
    // no-op: 取れなければ Chrome のデフォルト位置にする
  }
  const baseCreate = {
    url,
    type: 'popup',
    width: POPUP_WINDOW_WIDTH,
    height: POPUP_WINDOW_HEIGHT,
    focused: true,
    state: 'normal'
  };
  const createOpts = stripPositionHints
    ? baseCreate
    : { ...baseCreate, ...positionHint };
  /** @type {chrome.windows.Window | undefined} */
  let created;
  try {
    created = await chrome.windows.create(createOpts);
  } catch {
    await closeAllOurExtensionPopupWindows();
    await sleep(90);
    try {
      created = await chrome.windows.create(createOpts);
    } catch {
      // 座標付きが環境で拒否されるケースの最後の手段（位置は Chrome 任せ）
      try {
        created = await chrome.windows.create(baseCreate);
      } catch {
        /* created 未設定のまま下で throw */
      }
    }
  }
  if (created && created.id != null) {
    try {
      await chrome.windows.update(created.id, { focused: true });
    } catch {
      // no-op
    }
    return;
  }
  throw new Error('nls-popup-window-create-failed');
}

/**
 * ツールバーアイコン押下: watch ならインライン前面化、それ以外は **従来の standalone popup 窓**。
 *
 * 0.1.67 (AW) では非 watch で `chrome.sidePanel.open` を試していたが、
 * 環境・タブ種別によってサイドパネルが空／未表示に見え「いつもの POP が出ない」
 * となる報告があったため、インラインにフォーカスできないときは **常に**
 * `openOrFocusPopupWindow()` に戻す（サイドパネルは manifest の default_path の
 * まま、Chrome UI から手動で開く利用は可能）。
 *
 * - watch ページ: `NLS_FOCUS_INLINE_PANEL` で前面化、`{ focused: true }` なら終了
 * - それ以外・失敗時: `chrome.windows.create` の popup 窓（従来どおり）
 * - `getToolbarActionPolicy() === 'always_open_popup'` は常に popup のみ（互換）
 *
 * @param {import('chrome').tabs.Tab|undefined} tab
 */
/**
 * v0.1.496: chrome.tabs.sendMessage を必ず有界化する。
 *   視聴タブのメインスレッドが重い処理（大量コメントの全件マージ等）でフリーズしていると、
 *   content script の async listener が sendResponse する前に固まり、sendMessage の Promise が
 *   いつまでも resolve/reject しない。これを await するとツールバー押下ハンドラ自体がハングし、
 *   popup 窓 fallback にすら到達しない＝「アイコンを押しても無反応・Chrome を全部閉じるまで直らない」
 *   の主因になる。タイムアウトを設け、応答が無ければ未フォーカス扱いで fallback に進める。
 * @param {number} tid
 * @param {unknown} message
 * @param {number} timeoutMs
 * @returns {Promise<any>} 応答 or タイムアウト時 null
 */
function sendTabMessageWithTimeout(tid, message, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, Math.max(1, Number(timeoutMs) || 1200));
    try {
      chrome.tabs
        .sendMessage(tid, message, { frameId: 0 })
        .then((res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(res);
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

async function handleBrowserActionClick(tab) {
  try {
    const policy = await getToolbarActionPolicy();
    if (policy === 'always_open_popup') {
      // 旧設定の人は popup window を維持（互換）
      await openOrFocusPopupWindow(tab?.windowId);
      return;
    }
    const tid = tab && tab.id != null ? tab.id : chrome.tabs.TAB_ID_NONE;
    if (tid !== chrome.tabs.TAB_ID_NONE) {
      /*
       * 0.1.16 (P): frameId: 0 を明示し、top frame の listener にのみ届ける。
       * manifest.json の content.js は all_frames: true で iframe（プレイヤー埋込
       * 等）にも注入されている。frameId 指定なしで sendMessage するとすべての
       * フレームに broadcast され、iframe の listener が
       *   if (!isWatchInlinePanelTopFrame()) return false;
       * で同期 false を返して port を閉じてしまう。top frame の async listener が
       * sendResponse({focused:true}) する前に port closed エラーになり、
       * background が popup 窓を fallback として開いてしまう（user 報告：
       * インラインパネル + popup 窓が同時に出る）。
       *
       * v0.1.496: タブがフリーズしていても固まらないよう sendTabMessageWithTimeout で
       *   有界化。応答が無ければ null → fallback の popup 窓を開く。
       */
      const res = await sendTabMessageWithTimeout(
        tid,
        { type: 'NLS_FOCUS_INLINE_PANEL' },
        1200
      );
      if (res && res.focused) return;
      // v0.1.486: 初期化直後は host/iframe が未準備で focused=false になりやすい。
      //   すぐ popup fallback を開くと「一瞬開いて消える/何も出ない」体験になるため、
      //   短い猶予を置いて再確認する（最小差分・既存 fallback は維持）。
      await new Promise((r) => setTimeout(r, 700));
      const resRetry = await sendTabMessageWithTimeout(
        tid,
        { type: 'NLS_FOCUS_INLINE_PANEL' },
        1200
      );
      if (resRetry && resRetry.focused) return;
    }
    await openOrFocusPopupWindow(tab?.windowId);
  } catch {
    try {
      await openOrFocusPopupWindow(tab?.windowId);
    } catch {
      /* no-op */
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
  if (msg.type === 'NLS_FOCUS_INLINE_PANEL_FROM_POPUP') {
    if (!sender || sender.id !== chrome.runtime.id) return undefined;
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tid = tab && tab.id != null ? tab.id : chrome.tabs.TAB_ID_NONE;
        if (tid === chrome.tabs.TAB_ID_NONE) {
          sendResponse({ focused: false });
          return;
        }
        try {
          const res = await chrome.tabs.sendMessage(
            tid,
            { type: 'NLS_FOCUS_INLINE_PANEL' },
            { frameId: 0 }
          );
          if (res && res.focused) {
            sendResponse({ focused: true });
            return;
          }
        } catch {
          // no-op
        }
        await new Promise((r) => setTimeout(r, 700));
        try {
          const resRetry = await chrome.tabs.sendMessage(
            tid,
            { type: 'NLS_FOCUS_INLINE_PANEL' },
            { frameId: 0 }
          );
          sendResponse({ focused: Boolean(resRetry && resRetry.focused) });
        } catch {
          sendResponse({ focused: false });
        }
      } catch {
        sendResponse({ focused: false });
      }
    })();
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  void handleBrowserActionClick(tab).catch(() => {
    void openOrFocusPopupWindow(tab?.windowId);
  });
});

/* ------------------------------------------------------------------ */
/* dev 専用ホットリロード（手動 reload 卒業・2026-06-01）                       */
/* content（dev watch ビルドのみ）が NLS_DEV_RELOAD_PEEK で現在のシグナル id を   */
/* 問い合わせ、変化を検知したら NLS_DEV_RELOAD_GO を送ってくる。判定の状態機械は   */
/* content 側の純関数（src/lib/devReloadSignal.js・単体テスト済み）が持つ。       */
/* SW は「シグナルファイルを読む」「タブ reload + runtime.reload」だけ担当する。   */
/* 本番ビルドでは content がこれらを一切送らない（NL_DEV_HOTRELOAD=false で除去）  */
/* 上、シグナルファイル dist/dev-reload-id.txt も同梱されない（build.mjs/stage    */
/* スクリプトが生成・コピーしない）ため、PEEK が来ても id=null で必ず no-op になる。*/
/* ------------------------------------------------------------------ */
const DEV_RELOAD_SIGNAL_PATH = 'dist/dev-reload-id.txt';
let _devReloadGoInFlight = false;

async function readDevReloadSignalId() {
  try {
    const res = await fetch(chrome.runtime.getURL(DEV_RELOAD_SIGNAL_PATH), {
      cache: 'no-store'
    });
    if (!res || !res.ok) return null;
    const text = String(await res.text()).trim();
    if (!text || text.length > 128) return null;
    return text;
  } catch {
    return null;
  }
}

async function doDevReloadGo() {
  if (_devReloadGoInFlight) return;
  _devReloadGoInFlight = true;
  try {
    // 先にタブを reload（ブラウザ側ナビゲーションは runtime.reload を跨いで生き残り、
    //   再注入時には新しい dist/content.js が入る）→ そのあと拡張本体を reload。
    const tabs = await queryTargetTabs();
    for (const tab of tabs) {
      if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) continue;
      try {
        await chrome.tabs.reload(tab.id);
      } catch {
        /* no-op */
      }
    }
    try {
      chrome.runtime.reload();
    } catch {
      /* no-op */
    }
  } finally {
    _devReloadGoInFlight = false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.type !== 'NLS_DEV_RELOAD_PEEK' && msg.type !== 'NLS_DEV_RELOAD_GO')) {
    return undefined;
  }
  if (!sender || sender.id !== chrome.runtime.id) return undefined;
  if (msg.type === 'NLS_DEV_RELOAD_PEEK') {
    readDevReloadSignalId()
      .then((id) => {
        try {
          sendResponse({ id });
        } catch {
          /* no-op */
        }
      })
      .catch(() => {
        try {
          sendResponse({ id: null });
        } catch {
          /* no-op */
        }
      });
    return true; // 非同期 sendResponse
  }
  void doDevReloadGo();
  return undefined;
});

// v0.1.723: Proxy fetch for VOICEVOX to bypass CSP/mixed-content in content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'NLS_FETCH_PROXY') return undefined;
  // セキュリティ: 自拡張のみ許可(他の onMessage handler と同じガード)
  if (!sender || sender.id !== chrome.runtime.id) return undefined;
  // SSRF 防止: VOICEVOX ローカルホスト(host_permissions に列挙済み)のみ通す
  let targetUrl;
  try {
    targetUrl = new URL(String(msg.url || ''));
  } catch {
    sendResponse({ error: 'Invalid URL' });
    return true;
  }
  const allowed =
    (targetUrl.hostname === '127.0.0.1' && targetUrl.port === '50021') ||
    (targetUrl.hostname === '127.0.0.1' && targetUrl.port === '3456') ||
    (targetUrl.hostname === 'localhost' && targetUrl.port === '3456');
  if (!allowed) {
    sendResponse({ error: 'URL not allowed' });
    return true;
  }
  fetch(msg.url, msg.init)
    .then(res => {
      if (msg.wantBuffer) {
        return res.arrayBuffer().then(buf => ({
          ok: res.ok,
          status: res.status,
          buffer: Array.from(new Uint8Array(buf))
        }));
      } else {
        return res.text().then(text => ({
          ok: res.ok,
          status: res.status,
          text
        }));
      }
    })
    .then(data => sendResponse(data))
    .catch(err => sendResponse({ error: err.message }));
  return true; // async
});

