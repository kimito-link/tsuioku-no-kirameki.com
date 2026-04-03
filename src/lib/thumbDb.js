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
        const getReq = idx.getAll(lid);
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => {
          const all = /** @type {{ id: number, capturedAt: number }[]} */ (
            getReq.result || []
          );
          all.sort((a, b) => a.capturedAt - b.capturedAt);
          const toDrop = thumbIdsToDropForFifo(
            all.map((r) => ({ id: r.id, capturedAt: r.capturedAt })),
            MAX_THUMBS_PER_LIVE
          );
          for (const id of toDrop) {
            store.delete(id);
          }
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
      const r = idx.getAll(lid);
      r.onsuccess = () => resolve((r.result || []).length);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
