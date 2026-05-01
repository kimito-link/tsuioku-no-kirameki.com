/**
 * 配信セッション単位の軽量サマリ（ポップアップの IndexedDB）
 */

export const BROADCAST_SUMMARY_DB_NAME = 'nls_broadcast_summary_v1';
export const BROADCAST_SUMMARY_STORE = 'samples';
const DB_VERSION = 1;

/** 全体の行数上限（肥大化抑制） */
export const BROADCAST_SUMMARY_MAX_ROWS = 5000;
/** 1 liveId あたり保持する最大行数 */
export const BROADCAST_SUMMARY_MAX_PER_LIVE = 200;

/**
 * @typedef {{
 *   id?: number,
 *   liveId: string,
 *   capturedAt: number,
 *   watchUrl: string,
 *   recording: boolean,
 *   commentStorageCount: number,
 *   uniqueKnownCommenters: number,
 *   giftUserCount: number,
 *   peakConcurrentEstimate: number|null,
 *   officialCommentCount: number|null,
 *   officialViewerCount: number|null,
 *   officialCaptureRatio: number|null,
 *   broadcastTitle?: string,
 *   broadcasterName?: string,
 *   broadcasterUserId?: string,
 *   broadcasterIconUrl?: string,
 *   broadcasterPageUrl?: string,
 *   thumbnailUrl?: string,
 *   viewerCountFromDom?: number|null
 * }} BroadcastSessionSummaryRow
 *
 * 追加フィールド（0.1.69 配信なし empty state 改善 AY）:
 * - broadcastTitle / broadcasterName / broadcasterUserId / broadcasterIconUrl /
 *   broadcasterPageUrl / thumbnailUrl / viewerCountFromDom はすべて undefined 許容。
 * - 既存ユーザーの IDB は version bump なしで読み書き可能（古い行は新フィールドが
 *   undefined のまま残り、empty state 側は「未取得」フォールバックで描く）。
 * - 新行は broadcastSessionSummaryFlush.js で snapshot から自動的に埋まる。
 */

/** @returns {Promise<IDBDatabase>} */
export function openBroadcastSessionSummaryDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BROADCAST_SUMMARY_DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BROADCAST_SUMMARY_STORE)) {
        const s = db.createObjectStore(BROADCAST_SUMMARY_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        s.createIndex('byLiveCaptured', ['liveId', 'capturedAt'], {
          unique: false
        });
        s.createIndex('byCapturedAt', 'capturedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {Omit<BroadcastSessionSummaryRow, 'id'>} row
 * @returns {Promise<void>}
 */
export async function appendBroadcastSessionSummarySample(db, row) {
  const lid = String(row.liveId || '').trim().toLowerCase();
  if (!lid) return;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(BROADCAST_SUMMARY_STORE, 'readwrite');
    const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
    const addReq = store.add({ ...row, liveId: lid });
    addReq.onerror = () => reject(addReq.error);
    addReq.onsuccess = () => resolve(undefined);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });

  await pruneBroadcastSessionSummaryForLive(db, lid);
  await pruneBroadcastSessionSummaryGlobal(db);
}

/**
 * @param {IDBDatabase} db
 * @param {string} liveId
 * @param {number} limit
 * @returns {Promise<BroadcastSessionSummaryRow[]>}
 */
export async function listBroadcastSessionSummaryForLive(db, liveId, limit) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return [];

  const lim =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : 30;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(BROADCAST_SUMMARY_STORE, 'readonly');
    const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
    const idx = store.index('byLiveCaptured');
    const range = IDBKeyRange.bound([lid, 0], [lid, Number.MAX_SAFE_INTEGER]);
    const req = idx.openCursor(range, 'prev');
    /** @type {BroadcastSessionSummaryRow[]} */
    const out = [];
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur || out.length >= lim) {
        resolve(out);
        return;
      }
      out.push(/** @type {BroadcastSessionSummaryRow} */ (cur.value));
      cur.continue();
    };
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} liveId
 * @returns {Promise<void>}
 */
export async function pruneBroadcastSessionSummaryForLive(db, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(BROADCAST_SUMMARY_STORE, 'readwrite');
    const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
    const idx = store.index('byLiveCaptured');
    const range = IDBKeyRange.bound([lid, 0], [lid, Number.MAX_SAFE_INTEGER]);
    const req = idx.openCursor(range, 'next');
    /** @type {BroadcastSessionSummaryRow[]} */
    const all = [];
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        all.push(/** @type {BroadcastSessionSummaryRow} */ (cur.value));
        cur.continue();
        return;
      }
      if (all.length <= BROADCAST_SUMMARY_MAX_PER_LIVE) {
        resolve(undefined);
        return;
      }
      all.sort((a, b) => a.capturedAt - b.capturedAt);
      const drop = all.length - BROADCAST_SUMMARY_MAX_PER_LIVE;
      for (let i = 0; i < drop; i += 1) {
        const id = all[i].id;
        if (typeof id === 'number') store.delete(id);
      }
      resolve(undefined);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @returns {Promise<void>}
 */
export async function pruneBroadcastSessionSummaryGlobal(db) {
  const total = await new Promise((resolve, reject) => {
    const tx = db.transaction(BROADCAST_SUMMARY_STORE, 'readonly');
    const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
    const r = store.count();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
  if (total <= BROADCAST_SUMMARY_MAX_ROWS) return;
  const toDrop = total - BROADCAST_SUMMARY_MAX_ROWS;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(BROADCAST_SUMMARY_STORE, 'readwrite');
    const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
    const idx = store.index('byCapturedAt');
    const curReq = idx.openCursor();
    let dropped = 0;
    curReq.onerror = () => reject(curReq.error);
    curReq.onsuccess = () => {
      const cur = curReq.result;
      if (!cur || dropped >= toDrop) {
        resolve(undefined);
        return;
      }
      const row = /** @type {BroadcastSessionSummaryRow} */ (cur.value);
      const id = row.id;
      if (typeof id === 'number') {
        store.delete(id);
        dropped += 1;
      }
      cur.continue();
    };
    tx.onerror = () => reject(tx.error);
  });
}
