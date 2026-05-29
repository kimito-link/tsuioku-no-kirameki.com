/**
 * MV3 Service Worker
 *
 * - 初回インストール/ブラウザ起動時: 既存 watch タブへ注入して即利用可能にする
 * - 拡張更新時: 既存 watch タブをリロードし、古い extension context を残さない
 */

// @ts-nocheck — service worker; Chrome API と動的インデックスが多く checkJs コストが高い

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

  const key = commentsStorageKey(lid);
  const bag = await chrome.storage.local.get(key);
  const comments = Array.isArray(bag[key]) ? bag[key] : [];
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
  })();
});

chrome.runtime.onStartup.addListener(() => {
  ensureToolbarOpensPopupNotSidePanel();
  void ensureAutoBackupAlarm();
  void migrateFloatingPanelToDockProfileOnce();
  void migrateBelowPanelToDockProfileOnce();
  void injectIntoExistingTabs();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== AUTO_BACKUP_ALARM) return;
  void runAutoBackupCycle();
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
          ours = true;
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
  await closeAllOurExtensionPopupWindows();
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
      try {
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
         */
        const res = await chrome.tabs.sendMessage(
          tid,
          { type: 'NLS_FOCUS_INLINE_PANEL' },
          { frameId: 0 }
        );
        if (res && res.focused) return;
      } catch {
        // コンテンツ未注入・対象外 URL
      }
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

chrome.action.onClicked.addListener((tab) => {
  void handleBrowserActionClick(tab).catch(() => {
    void openOrFocusPopupWindow(tab?.windowId);
  });
});
