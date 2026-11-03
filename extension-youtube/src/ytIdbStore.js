// ytIdbStore.js — YouTube Live コメントを配信(videoId)ごとに全件 IndexedDB へ記録・差分取得するストア
/* global indexedDB, IDBKeyRange */

import { prepareYtCommentsForIdb } from '../../src/lib/youtube/ytStreamStorePolicy.js';

const DB_NAME = 'yt_kirameki_db';
const DB_VERSION = 2;
const STORE_COMMENTS = 'comments';
const INDEX_BY_VIDEO_ID = 'by_videoId';
const INDEX_BY_VIDEO_ID_RECORDED_AT = 'by_videoId_recordedAt';

/** @type {Promise<any> | null} */
let dbPromise = null;

/**
 * IndexedDB (`yt_kirameki_db`) を開く。
 * DB Version 2 で `by_videoId_recordedAt`（複合インデックス `['videoId', 'recordedAt']`）を作成し、
 * サイドパネルの差分取得（`afterRecordedAt` 以降の新着のみ取得）に対応する。
 * @returns {Promise<any>}
 */
export function openYtCommentsDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        let store;
        if (!db.objectStoreNames.contains(STORE_COMMENTS)) {
          store = db.createObjectStore(STORE_COMMENTS, { keyPath: 'pk' });
        } else {
          store = req.transaction.objectStore(STORE_COMMENTS);
        }
        if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID)) {
          store.createIndex(INDEX_BY_VIDEO_ID, 'videoId', { unique: false });
        }
        if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
          store.createIndex(INDEX_BY_VIDEO_ID_RECORDED_AT, ['videoId', 'recordedAt'], {
            unique: false,
          });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error('idb_open_failed'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * 1つの配信（`videoId`）に新着コメント群を追加保存する（上限間引きなし・全件保存）。
 * 既に同一 `pk`（`videoId::id`）が存在するコメントはスキップし、新規追加されたものだけ `newlyAdded` に返す。
 *
 * @param {string} videoId
 * @param {any[]} incomingItems
 * @returns {Promise<{ newlyAdded: any[], totalCount: number }>}
 */
export async function appendYtStreamCommentsIdb(videoId, incomingItems) {
  const vid = String(videoId || '').trim();
  const records = prepareYtCommentsForIdb(vid, incomingItems);
  const db = await openYtCommentsDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readwrite');
    const store = tx.objectStore(STORE_COMMENTS);
    const index = store.index(INDEX_BY_VIDEO_ID);

    /** @type {any[]} */
    const newlyAdded = [];
    let totalCount = 0;

    let idx = 0;
    const processNext = () => {
      if (idx >= records.length) {
        const countReq = index.count(IDBKeyRange.only(vid));
        countReq.onsuccess = () => {
          totalCount = Number(countReq.result || 0);
        };
        return;
      }

      const rec = records[idx];
      idx += 1;
      const getReq = store.get(rec.pk);
      getReq.onsuccess = () => {
        if (!getReq.result) {
          store.put(rec);
          newlyAdded.push(rec);
        }
        processNext();
      };
      getReq.onerror = () => {
        processNext();
      };
    };

    processNext();

    tx.oncomplete = () => {
      resolve({ newlyAdded, totalCount });
    };
    tx.onerror = () => {
      reject(tx.error || new Error('idb_append_failed'));
    };
  });
}

/**
 * 指定された配信（`videoId`）の保存済みコメントを IndexedDB から全件取得する（初回オープン・配信切替時のみ使用）。
 *
 * @param {string} videoId
 * @returns {Promise<any[]>}
 */
export async function getYtStreamCommentsByVideoId(videoId) {
  const vid = String(videoId || '').trim();
  if (!vid) return [];

  const db = await openYtCommentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readonly');
    const store = tx.objectStore(STORE_COMMENTS);
    if (store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
      const index = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
      const range = IDBKeyRange.bound([vid, 0], [vid, Number.MAX_SAFE_INTEGER]);
      const req = index.getAll(range);
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => {
        reject(req.error || new Error('idb_get_failed'));
      };
      return;
    }

    const index = store.index(INDEX_BY_VIDEO_ID);
    const req = index.getAll(IDBKeyRange.only(vid));
    req.onsuccess = () => {
      const list = Array.isArray(req.result) ? req.result : [];
      list.sort((a, b) => Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
      resolve(list);
    };
    req.onerror = () => {
      reject(req.error || new Error('idb_get_failed'));
    };
  });
}

/**
 * 指定された配信（`videoId`）について、`afterRecordedAt` 以降に記録された新着コメントだけを
 * 複合インデックス `by_videoId_recordedAt` で差分取得する（storage 変化のたびに全件 getAll しない）。
 *
 * @param {string} videoId
 * @param {number} afterRecordedAt
 * @returns {Promise<any[]>}
 */
export async function getYtStreamCommentsSince(videoId, afterRecordedAt = 0) {
  const vid = String(videoId || '').trim();
  if (!vid) return [];
  const lower =
    typeof afterRecordedAt === 'number' && Number.isFinite(afterRecordedAt) && afterRecordedAt > 0
      ? afterRecordedAt
      : 0;

  const db = await openYtCommentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readonly');
    const store = tx.objectStore(STORE_COMMENTS);
    const index = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
    const range = IDBKeyRange.bound([vid, lower], [vid, Number.MAX_SAFE_INTEGER]);
    const req = index.getAll(range);

    req.onsuccess = () => {
      resolve(Array.isArray(req.result) ? req.result : []);
    };
    req.onerror = () => {
      reject(req.error || new Error('idb_get_since_failed'));
    };
  });
}
