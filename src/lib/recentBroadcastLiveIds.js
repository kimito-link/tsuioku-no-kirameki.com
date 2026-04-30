/**
 * 最近の放送 liveId を `broadcastSessionSummary_v1` IDB から取得する純粋関数群。
 *
 * 設計（0.1.30 AE: chrome.storage.local.get(null) 負荷削減）:
 *   - 0.1.23 で過去 N 配信のコメントをマーケ DL 時にロードする実装が入ったが、
 *     `chrome.storage.local.get(null)` で全 storage を読んでいた。これは
 *     200+ 配信 × 数 MB のデータを毎回ロードする原因になり、メモリと
 *     時間の浪費だった。
 *   - 改善: `broadcastSessionSummary_v1` IDB の `byCapturedAt` index を
 *     新→古で iterate して unique な liveId を最大 N 件抜く。その liveId
 *     から `nls_comments_<lid>` キーリストを作り、`storage.local.get(keys)`
 *     で必要分だけ取得する。
 *
 *   この lib は IDB 操作を含むため非純粋だが、入出力は明確で
 *   `db` を引数で受け取る形にし vitest fakeIndexedDb で testable にする。
 */

import { BROADCAST_SUMMARY_STORE } from './broadcastSessionSummaryDb.js';

/**
 * @param {IDBDatabase} db
 * @param {{ limit?: number, excludeLiveId?: string }} [opts]
 * @returns {Promise<string[]>}
 */
export async function listRecentUniqueBroadcastLiveIds(db, opts = {}) {
  const limit =
    typeof opts.limit === 'number' && opts.limit > 0 ? Math.floor(opts.limit) : 10;
  const exclude = String(opts.excludeLiveId || '').trim().toLowerCase();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(BROADCAST_SUMMARY_STORE, 'readonly');
    } catch (e) {
      reject(e);
      return;
    }
    const store = tx.objectStore(BROADCAST_SUMMARY_STORE);
    const idx = store.index('byCapturedAt');
    const req = idx.openCursor(null, 'prev');
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {string[]} */
    const out = [];
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur || out.length >= limit) {
        resolve(out);
        return;
      }
      const lid = String(cur.value?.liveId || '').trim().toLowerCase();
      if (lid && lid !== exclude && !seen.has(lid)) {
        seen.add(lid);
        out.push(lid);
      }
      cur.continue();
    };
  });
}
