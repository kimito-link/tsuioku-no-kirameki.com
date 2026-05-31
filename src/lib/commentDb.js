/**
 * v0.1.514: コメント本体の保存先を `chrome.storage.local`（値まるごと structured clone・
 *   約120 writes/min・50MB 超で劣化・多タブで単一ストアを奪い合い）から **IndexedDB** へ移す
 *   ための拡張オリジン DB ラッパ（純粋な IDB 操作のみ・Chrome API 非依存）。
 *
 * 背景（2026-05-31 世界事例リサーチ）:
 *   - 数万件×多タブでは chrome.storage.local が構造的に限界（保存・表示が単一ストアを奪い合い、
 *     read/write が timeout → 「記録が増えない」「パネルが裏ロード継続/—固定」）。
 *   - IndexedDB は 1 件＝1 レコードの追記、index による範囲読み・件数取得（全件 deserialize 不要）、
 *     GB 級容量、書き込みレート制限なし。サムネ（thumbDb.js）で既に実績がある作法。
 *
 * 配置（重要）:
 *   - この DB は **拡張オリジン**（chrome-extension://<id>）に作る。書き手は background SW、
 *     読み手は popup（同一拡張オリジン）。**content script はページオリジン**なので直接触れず、
 *     SW へ batch を送って書いてもらう（単一書き手＝多タブ競合の根治）。
 *   - dedupe キー（dkey）は呼び出し側（content の buildDedupeKey）が付与して渡す。SW はキー式を
 *     持たずに `dkey` だけで重複判定するので、commentRecord との二重実装を避けられる。
 *
 * スキーマ定数は background.js（ESM import 不可の手書き SW）がミラーする。drift 防止のため
 * commentDb.test.js がリテラル値を検査する。
 *
 * @module commentDb
 */

/** 拡張オリジンのコメント DB 名。 */
export const COMMENT_DB_NAME = 'nls_comment_db_v1';
/** オブジェクトストア名（1 コメント＝1 レコード）。 */
export const COMMENT_DB_STORE = 'comments';
/** スキーマバージョン。 */
export const COMMENT_DB_VERSION = 1;
/** liveId index 名（件数・範囲読み・削除に使用）。 */
export const COMMENT_DB_INDEX_BY_LIVE = 'byLive';
/** dedupe キー index 名（追記時の重複判定に使用・unique ではなく getKey で照合）。 */
export const COMMENT_DB_INDEX_BY_DKEY = 'byDkey';

/** @returns {boolean} */
export function isCommentDbAvailable() {
  return typeof indexedDB !== 'undefined';
}

/**
 * @returns {Promise<IDBDatabase>}
 */
export function openCommentDb() {
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

/**
 * 1 件の row（dkey 付与済み）を保存用レコードへ正規化する純関数。
 * @param {string} liveId
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>|null} 無効（text 空 or dkey 空）なら null
 */
export function normalizeDbRecord(liveId, row) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !row || typeof row !== 'object') return null;
  const text = String(row.text ?? '').trim();
  if (!text) return null;
  const dkey = String(row.dkey ?? '').trim();
  if (!dkey) return null;
  /** @type {Record<string, unknown>} */
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

/**
 * dkey 重複を弾きつつ rows を追記する。1 つの readwrite トランザクション内で、
 * 既存 dkey は `byDkey.getKey` で O(log n) 照合し、未出のものだけ `add` する。
 * 同一バッチ内の重複も Set で弾く。
 *
 * @param {IDBDatabase} db
 * @param {string} liveId
 * @param {Array<Record<string, unknown>>} rows dkey 付与済み
 * @returns {Promise<{ added: number }>}
 */
export function appendCommentsToDb(db, liveId, rows) {
  const lid = String(liveId || '').trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];
  return new Promise((resolve, reject) => {
    if (!lid || list.length === 0) {
      resolve({ added: 0 });
      return;
    }
    let added = 0;
    /** @type {Set<string>} */
    const batchSeen = new Set();
    const tx = db.transaction(COMMENT_DB_STORE, 'readwrite');
    const store = tx.objectStore(COMMENT_DB_STORE);
    const dkeyIndex = store.index(COMMENT_DB_INDEX_BY_DKEY);
    for (const row of list) {
      const rec = normalizeDbRecord(lid, row);
      if (!rec) continue;
      const dkey = String(rec.dkey || '');
      if (!dkey || batchSeen.has(dkey)) continue;
      batchSeen.add(dkey);
      const getReq = dkeyIndex.getKey(dkey);
      getReq.onsuccess = () => {
        if (getReq.result === undefined || getReq.result === null) {
          store.add(rec);
          added += 1;
        }
      };
      // getReq.onerror はトランザクション全体の onerror に伝播させる（個別 reject しない）。
    }
    tx.oncomplete = () => resolve({ added });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * liveId のコメント件数を、全件 deserialize せず index.count で取得する。
 * @param {IDBDatabase} db
 * @param {string} liveId
 * @returns {Promise<number>}
 */
export function countCommentsForLive(db, liveId) {
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

/**
 * liveId の全コメントを挿入順（id 昇順）で返す。
 * @param {IDBDatabase} db
 * @param {string} liveId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export function readAllCommentsForLive(db, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  return new Promise((resolve, reject) => {
    if (!lid) {
      resolve([]);
      return;
    }
    /** @type {Array<Record<string, unknown>>} */
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
      out.push(/** @type {Record<string, unknown>} */ (cursor.value));
      cursor.continue();
    };
    curReq.onerror = () => reject(curReq.error);
  });
}

/**
 * liveId の直近 n 件（capturedAt の新しい順に集めて、返却は古い→新しいの昇順）を返す。
 * パネルの ticker / サマリ初期表示用（全件読まない）。
 * @param {IDBDatabase} db
 * @param {string} liveId
 * @param {number} n
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export function readRecentCommentsForLive(db, liveId, n) {
  const lid = String(liveId || '').trim().toLowerCase();
  const want = Math.max(0, Math.floor(Number(n) || 0));
  return new Promise((resolve, reject) => {
    if (!lid || want === 0) {
      resolve([]);
      return;
    }
    /** @type {Array<Record<string, unknown>>} */
    const out = [];
    const tx = db.transaction(COMMENT_DB_STORE, 'readonly');
    const idx = tx.objectStore(COMMENT_DB_STORE).index(COMMENT_DB_INDEX_BY_LIVE);
    // id 昇順 = 挿入順。末尾 n 件が欲しいので 'prev'（降順）で n 件取り、最後に反転。
    const curReq = idx.openCursor(IDBKeyRange.only(lid), 'prev');
    curReq.onsuccess = () => {
      const cursor = curReq.result;
      if (!cursor || out.length >= want) {
        out.reverse();
        resolve(out);
        return;
      }
      out.push(/** @type {Record<string, unknown>} */ (cursor.value));
      cursor.continue();
    };
    curReq.onerror = () => reject(curReq.error);
  });
}

/**
 * liveId の全レコードを削除する（再移行のやり直しなど・通常運用では使わない）。
 * @param {IDBDatabase} db
 * @param {string} liveId
 * @returns {Promise<{ deleted: number }>}
 */
export function clearCommentsForLive(db, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  return new Promise((resolve, reject) => {
    if (!lid) {
      resolve({ deleted: 0 });
      return;
    }
    let deleted = 0;
    const tx = db.transaction(COMMENT_DB_STORE, 'readwrite');
    const idx = tx.objectStore(COMMENT_DB_STORE).index(COMMENT_DB_INDEX_BY_LIVE);
    const curReq = idx.openCursor(IDBKeyRange.only(lid));
    curReq.onsuccess = () => {
      const cursor = curReq.result;
      if (!cursor) return;
      cursor.delete();
      deleted += 1;
      cursor.continue();
    };
    curReq.onerror = () => reject(curReq.error);
    tx.oncomplete = () => resolve({ deleted });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
