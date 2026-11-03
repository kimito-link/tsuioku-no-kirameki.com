// ytIdbStore.js — YouTube Live コメントを配信(videoId)ごとに全件 IndexedDB へ記録・取得するストア
/* global indexedDB, IDBKeyRange */

import { prepareYtCommentsForIdb } from '../../src/lib/youtube/ytStreamStorePolicy.js';

const DB_NAME = 'yt_kirameki_db';
const DB_VERSION = 1;
const STORE_COMMENTS = 'comments';
const INDEX_BY_VIDEO_ID = 'by_videoId';

/** @type {Promise<any> | null} */
let dbPromise = null;

/**
 * IndexedDB (`yt_kirameki_db`) を開く。
 * @returns {Promise<any>}
 */
export function openYtCommentsDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_COMMENTS)) {
          const store = db.createObjectStore(STORE_COMMENTS, { keyPath: 'pk' });
          store.createIndex(INDEX_BY_VIDEO_ID, 'videoId', { unique: false });
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
 * 指定された配信（`videoId`）の保存済みコメントだけを IndexedDB から全件取得する。
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
