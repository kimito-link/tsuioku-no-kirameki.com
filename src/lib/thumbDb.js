/**
 * サムネイル用 IndexedDB（コンテンツスクリプトのみで使用）
 */
import { thumbIdsToDropForFifo, MAX_THUMBS_PER_LIVE } from './thumbFifo.js';

const DB_NAME = 'nls_thumb_v1';
const STORE = 'thumbs';
const VERSION = 1;

/** @returns {boolean} */
export function isIndexedDbAvailable() {
  return typeof indexedDB !== 'undefined';
}

/**
 * @returns {Promise<IDBDatabase>}
 */
export function openThumbDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('byLive', 'liveId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} liveId
 * @param {Blob} blob
 * @returns {Promise<void>}
 *
 * 0.1.44 (Z): 旧実装は `idx.getAll(lid)` で記録済み全 thumbnail を一度に
 *   メモリに展開していた（500 枚 × 数百KB の Blob 配列 ≈ 100MB レベルの
 *   peak メモリ + UI hitch）。FIFO 判定には id と capturedAt しか必要ない
 *   ので、cursor で 1 件ずつ走査して summary 配列だけ作る形に変更。
 *   Blob 参照を都度作っては捨てるので peak メモリが大幅に下がる。
 */
export async function addThumbBlob(liveId, blob) {
  if (!isIndexedDbAvailable()) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !(blob instanceof Blob)) return;

  const db = await openThumbDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const idx = store.index('byLive');

      const addReq = store.add({
        liveId: lid,
        capturedAt: Date.now(),
        blob
      });
      addReq.onerror = () => reject(addReq.error);
      addReq.onsuccess = () => {
        /** @type {{ id: number, capturedAt: number }[]} */
        const summaries = [];
        const curReq = idx.openCursor(IDBKeyRange.only(lid));
        curReq.onerror = () => reject(curReq.error);
        curReq.onsuccess = () => {
          const cursor = curReq.result;
          if (!cursor) {
            summaries.sort((a, b) => a.capturedAt - b.capturedAt);
            const toDrop = thumbIdsToDropForFifo(
              summaries,
              MAX_THUMBS_PER_LIVE
            );
            for (const id of toDrop) {
              store.delete(id);
            }
            return;
          }
          const v = /** @type {{ capturedAt?: number }} */ (cursor.value || {});
          const id = typeof cursor.primaryKey === 'number'
            ? cursor.primaryKey
            : Number(cursor.primaryKey);
          const capturedAt = typeof v.capturedAt === 'number'
            ? v.capturedAt
            : 0;
          if (Number.isFinite(id) && id > 0 && capturedAt > 0) {
            summaries.push({ id, capturedAt });
          }
          cursor.continue();
        };
      };

      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * @param {string} liveId
 * @returns {Promise<number>}
 *
 * 0.1.44 (Z): 旧実装は `idx.getAll(lid)` で全 Blob を deserialize して
 *   `.length` だけ取っていた（メモリ無駄遣い）。`idx.count()` は値を読まず
 *   件数だけ返すので大幅に高速・省メモリ。
 */
export async function countThumbsForLive(liveId) {
  if (!isIndexedDbAvailable()) return 0;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return 0;
  const db = await openThumbDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const idx = tx.objectStore(STORE).index('byLive');
      const r = idx.count(IDBKeyRange.only(lid));
      r.onsuccess = () => {
        const n = Number(r.result);
        resolve(Number.isFinite(n) && n >= 0 ? n : 0);
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
