/**
 * 声の割り当て(人ごと)と配信のまとめ(配信ごと)の IndexedDB。
 * chrome.storage の1個の巨大な値を書き直さないための正本。版は v:1。
 */

import { YT_SPLIT_RECORD_VERSION } from './ytSplitPersist.js';

const DB_NAME = 'yt_split_persist_v1';
const DB_VERSION = 1;
const STORE_VOICE = 'voice';
const STORE_SUMMARY = 'summary';
const STORE_STALL = 'stall';

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
export function openYtSplitDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no_idb'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_VOICE)) db.createObjectStore(STORE_VOICE, { keyPath: 'userKey' });
      if (!db.objectStoreNames.contains(STORE_SUMMARY)) db.createObjectStore(STORE_SUMMARY, { keyPath: 'videoId' });
      if (!db.objectStoreNames.contains(STORE_STALL)) {
        const stall = db.createObjectStore(STORE_STALL, { keyPath: 'id', autoIncrement: true });
        stall.createIndex('byPage', 'page', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('idb_open'));
    };
  });
  return dbPromise;
}

/**
 * @param {string} store
 * @param {'readonly' | 'readwrite'} mode
 * @param {(s: IDBObjectStore) => void} fn
 * @returns {Promise<void>}
 */
function withStore(store, mode, fn) {
  return openYtSplitDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    fn(tx.objectStore(store));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  }));
}

/**
 * @param {Record<string, unknown>} people userKey → body
 * @returns {Promise<{ stored: number, readBack: number, skipped: string[] }>}
 */
export async function putVoicePeople(people) {
  const entries = Object.entries(people || {}).filter(([k, v]) => k && v && typeof v === 'object');
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const wrote = [];
  await withStore(STORE_VOICE, 'readwrite', (store) => {
    for (const [userKey, body] of entries) {
      if (userKey.length > 180) {
        skipped.push(userKey.slice(0, 40));
        continue;
      }
      wrote.push(userKey);
      store.put({ v: YT_SPLIT_RECORD_VERSION, userKey, body });
    }
  });
  let readBack = 0;
  await withStore(STORE_VOICE, 'readonly', (store) => {
    for (const userKey of wrote) {
      const req = store.get(userKey);
      req.onsuccess = () => {
        const row = req.result;
        if (row && row.v === YT_SPLIT_RECORD_VERSION && row.userKey === userKey) readBack += 1;
      };
    }
  });
  return { stored: wrote.length, readBack, skipped };
}

/** @returns {Promise<Record<string, unknown>>} */
export async function readAllVoices() {
  /** @type {Record<string, unknown>} */
  const out = {};
  const db = await openYtSplitDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOICE, 'readonly');
    const req = tx.objectStore(STORE_VOICE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const row = cur.value;
      if (row && row.v === YT_SPLIT_RECORD_VERSION && row.userKey && row.body) out[row.userKey] = row.body;
      cur.continue();
    };
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  return out;
}

/**
 * @param {string} videoId
 * @param {Record<string, unknown>} summary
 * @returns {Promise<{ stored: number, readBack: number }>}
 */
export async function putSummary(videoId, summary) {
  const id = String(videoId || '').trim();
  if (!id || !summary || typeof summary !== 'object') return { stored: 0, readBack: 0 };
  await withStore(STORE_SUMMARY, 'readwrite', (store) => {
    store.put({ v: YT_SPLIT_RECORD_VERSION, videoId: id, body: summary });
  });
  let readBack = 0;
  await withStore(STORE_SUMMARY, 'readonly', (store) => {
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result;
      if (row && row.v === YT_SPLIT_RECORD_VERSION && row.videoId === id && Number(row.body?.itemCount) === Number(summary.itemCount)) {
        readBack = 1;
      }
    };
  });
  return { stored: 1, readBack };
}

/** @returns {Promise<Record<string, any>>} */
export async function readAllSummaries() {
  /** @type {Record<string, any>} */
  const out = {};
  const db = await openYtSplitDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUMMARY, 'readonly');
    const req = tx.objectStore(STORE_SUMMARY).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const row = cur.value;
      if (row && row.v === YT_SPLIT_RECORD_VERSION && row.videoId && row.body) out[row.videoId] = row.body;
      cur.continue();
    };
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  return out;
}

/**
 * @param {string} page
 * @param {readonly { t: number, dur: number, file: string, domain: string, section: string }[]} rows
 * @returns {Promise<number>}
 */
export async function appendStallRows(page, rows) {
  const name = String(page || '').slice(0, 80);
  if (!name || !rows?.length) return 0;
  const db = await openYtSplitDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STALL, 'readwrite');
    const store = tx.objectStore(STORE_STALL);
    for (const row of rows) {
      store.add({
        v: YT_SPLIT_RECORD_VERSION,
        page: name,
        t: Number(row.t) || 0,
        dur: Number(row.dur) || 0,
        file: String(row.file || '').slice(0, 80),
        domain: String(row.domain || '').slice(0, 80),
        section: String(row.section || '').slice(0, 40),
      });
    }
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  const kept = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STALL, 'readwrite');
    const store = tx.objectStore(STORE_STALL);
    const idx = store.index('byPage');
    /** @type {number[]} */
    const ids = [];
    const req = idx.openCursor(IDBKeyRange.only(name));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      ids.push(Number(cur.primaryKey));
      cur.continue();
    };
    tx.oncomplete = () => {
      const extra = ids.slice(0, Math.max(0, ids.length - 200));
      if (!extra.length) {
        resolve(ids.length);
        return;
      }
      const tx2 = db.transaction(STORE_STALL, 'readwrite');
      const st = tx2.objectStore(STORE_STALL);
      for (const id of extra) st.delete(id);
      tx2.oncomplete = () => resolve(ids.length - extra.length);
      tx2.onerror = () => reject(tx2.error);
    };
    tx.onerror = () => reject(tx.error);
  });
  return Number(kept) || 0;
}
