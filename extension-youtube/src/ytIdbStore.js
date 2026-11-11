// ytIdbStore.js — YouTube Live コメントを配信(videoId)ごとに全件 IndexedDB へ記録・差分取得するストア
/* global indexedDB, IDBKeyRange */

import { prepareYtCommentsForIdb } from '../../src/lib/youtube/ytStreamStorePolicy.js';
import { readYtRowsInChunks } from '../../src/lib/youtube/ytChunkedRead.js';
import { YT_IDB_APPEND_CHUNK } from '../../src/lib/youtube/ytLiveRowOrder.js';

const DB_NAME = 'yt_kirameki_db';
const DB_VERSION = 3;
const STORE_COMMENTS = 'comments';
const INDEX_BY_VIDEO_ID = 'by_videoId';
const INDEX_BY_VIDEO_ID_RECORDED_AT = 'by_videoId_recordedAt';
// DB Version 3(0.1.1904): コメントの id(YouTube が1件ごとに付ける番号)で引く索引。
//   1件のコメントは1つの配信にしか無い。別の配信の記録に同じ id が既にあれば、それは別の配信のコメントなので入れない。
const INDEX_BY_ID = 'by_id';

/** @type {Promise<any> | null} */
let dbPromise = null;

/**
 * IndexedDB (`yt_kirameki_db`) を開く。
 * DB Version 2 で `by_videoId_recordedAt`（複合インデックス `['videoId', 'recordedAt']`）を作成し、
 * サイドパネルの差分取得（`afterRecordedAt` 以降の新着のみ取得）に対応する。
 * @returns {Promise<any>}
 */
/** 持っているつながりを捨てる(次に使うとき開き直す)。保存に失敗したときに呼ぶ。 */
export function resetYtCommentsDb() {
  const p = dbPromise;
  dbPromise = null;
  if (p) {
    p.then(
      (db) => {
        try {
          db.close();
        } catch {
          /* no-op */
        }
      },
      () => {},
    );
  }
}

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
        if (store && !store.indexNames.contains(INDEX_BY_ID)) {
          store.createIndex(INDEX_BY_ID, 'id', { unique: false });
        }
        if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
          store.createIndex(INDEX_BY_VIDEO_ID_RECORDED_AT, ['videoId', 'recordedAt'], {
            unique: false,
          });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // つながりが切れたら(ブラウザが閉じた・別の版が開こうとした)、次は開き直す。
        // 切れたつながりを持ち続けると、以後の保存が全部失敗して記録が黙って止まる。
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          dbPromise = null;
          try {
            db.close();
          } catch {
            /* no-op */
          }
        };
        resolve(db);
      };
      // 他のつながりのせいで開けないまま待ち続けないよう、待ちは知らせて開き直せるようにする
      req.onblocked = () => {
        dbPromise = null;
      };
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
 * ★opts.rejectOwnedElsewhere(0.1.1904・2026-11-06 りんく実機「前の配信の人が混ざる」): 同じ id のコメントが
 *   別の配信の記録に既にあれば入れない(`rejected` にその id と持ち主の配信を返す)。チャット欄が前の配信のまま残って
 *   同じコメントを別の配信として送ってきても、先に記録された配信のものとして扱う。YouTube の中の形(URL の印など)に
 *   頼らない守り=形が変わっても効く。チャット欄からの記録だけで使う(アーカイブの埋め直しは配信を名指しで読むので使わない)。
 * ★opts.claimFromOthers(0.1.1915・2026-11-07 実データで83件の重複): アーカイブの埋め直し用。アーカイブはその配信自身の
 *   チャットなので本物。同じ id が別の配信の記録にあれば、そちらを消して(`reclaimed` に消した行を返す)この配信に入れる。
 *
 * @param {string} videoId
 * @param {any[]} incomingItems
 * @param {{ rejectOwnedElsewhere?: boolean, claimFromOthers?: boolean }} [opts]
 * @returns {Promise<{ newlyAdded: any[], totalCount: number, rejected: Array<{ id: string, owner: string }>, reclaimed: Array<{ id: string, from: string, row: any }> }>}
 */
/**
 * 1回のトランザクションで、届いた順を崩さずに書く。
 * 読み出しは同じターンにまとめて出す(途中で手を返すとトランザクションが閉じる)。
 * @param {any} db
 * @param {string} vid
 * @param {any[]} records
 * @param {{ rejectOwnedElsewhere?: boolean, claimFromOthers?: boolean }} opts
 * @param {boolean} countAtEnd
 */
function appendYtChunkTx(db, vid, records, opts, countAtEnd) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readwrite');
    const store = tx.objectStore(STORE_COMMENTS);
    const index = store.index(INDEX_BY_VIDEO_ID);
    /** @type {any[]} */
    const slots = new Array(records.length);
    /** @type {Array<{ id: string, owner: string } | undefined>} */
    const rejectedSlots = new Array(records.length);
    /** @type {Array<Array<{ id: string, from: string, row: any }>>} */
    const reclaimedSlots = new Array(records.length);
    let totalCount = 0;
    let pending = records.length;
    const wantOwnerCheck = Boolean(opts.rejectOwnedElsewhere || opts.claimFromOthers);
    const byId = wantOwnerCheck && store.indexNames.contains(INDEX_BY_ID) ? store.index(INDEX_BY_ID) : null;

    const finishOne = () => {
      pending -= 1;
      if (pending > 0 || !countAtEnd) return;
      const countReq = index.count(IDBKeyRange.only(vid));
      countReq.onsuccess = () => {
        totalCount = Number(countReq.result || 0);
      };
    };

    /** @param {any} rec @param {number} i */
    const putOne = (rec, i) => {
      const getReq = store.get(rec.pk);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          store.put(rec);
          slots[i] = rec;
        } else if (rec.iconUrl && !existing.iconUrl) {
          store.put({ ...existing, iconUrl: rec.iconUrl });
        }
        finishOne();
      };
      getReq.onerror = () => finishOne();
    };

    if (!records.length) {
      if (countAtEnd) {
        const countReq = index.count(IDBKeyRange.only(vid));
        countReq.onsuccess = () => {
          totalCount = Number(countReq.result || 0);
        };
      }
    } else {
      records.forEach((rec, i) => {
        if (byId && rec.id) {
          const ownReq = byId.getAll(IDBKeyRange.only(rec.id), 4);
          ownReq.onsuccess = () => {
            const rows = Array.isArray(ownReq.result) ? ownReq.result : [];
            if (opts.claimFromOthers) {
              for (const r of rows) {
                if (!r || !r.videoId || r.videoId === vid || !r.pk) continue;
                store.delete(r.pk);
                (reclaimedSlots[i] || (reclaimedSlots[i] = [])).push({ id: String(rec.id), from: String(r.videoId), row: r });
              }
              putOne(rec, i);
              return;
            }
            const other = rows.find((r) => r && r.videoId && r.videoId !== vid);
            if (other) {
              rejectedSlots[i] = { id: String(rec.id), owner: String(other.videoId) };
              finishOne();
              return;
            }
            putOne(rec, i);
          };
          ownReq.onerror = () => putOne(rec, i);
          return;
        }
        putOne(rec, i);
      });
    }

    tx.oncomplete = () => {
      /** @type {any[]} */
      const newlyAdded = [];
      for (const rec of slots) if (rec) newlyAdded.push(rec);
      /** @type {Array<{ id: string, owner: string }>} */
      const rejected = [];
      for (const row of rejectedSlots) if (row) rejected.push(row);
      /** @type {Array<{ id: string, from: string, row: any }>} */
      const reclaimed = [];
      for (const part of reclaimedSlots) if (part) reclaimed.push(...part);
      resolve({ newlyAdded, totalCount, rejected, reclaimed });
    };
    tx.onerror = () => {
      reject(tx.error || new Error('idb_append_failed'));
    };
  });
}

export async function appendYtStreamCommentsIdb(videoId, incomingItems, opts = {}) {
  const vid = String(videoId || '').trim();
  const records = prepareYtCommentsForIdb(vid, incomingItems);
  const db = await openYtCommentsDb();
  if (!records.length) return appendYtChunkTx(db, vid, [], opts, true);

  /** @type {any[]} */
  const newlyAdded = [];
  /** @type {Array<{ id: string, owner: string }>} */
  const rejected = [];
  /** @type {Array<{ id: string, from: string, row: any }>} */
  const reclaimed = [];
  let totalCount = 0;
  for (let i = 0; i < records.length; i += YT_IDB_APPEND_CHUNK) {
    const last = i + YT_IDB_APPEND_CHUNK >= records.length;
    const part = await appendYtChunkTx(db, vid, records.slice(i, i + YT_IDB_APPEND_CHUNK), opts, last);
    newlyAdded.push(...part.newlyAdded);
    rejected.push(...part.rejected);
    reclaimed.push(...part.reclaimed);
    if (last) totalCount = part.totalCount;
    if (!last) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { newlyAdded, totalCount, rejected, reclaimed };
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
      // ★v0.1.1977: 5,000行ずつ取り出して合間に手を放す(8万行を1回で取り出すと遅い PC で約48秒返事が無かった)。
      //   読む行と順番は同じ(src/lib/youtube/ytChunkedRead.js)。区切りごとに別の transaction を開く。
      readYtRowsInChunks({
        readChunk: (lower, count) => new Promise((res, rej) => {
          const t0 = performance.now();
          const req = db.transaction([STORE_COMMENTS], 'readonly').objectStore(STORE_COMMENTS)
            .index(INDEX_BY_VIDEO_ID_RECORDED_AT)
            .getAll(IDBKeyRange.bound([vid, lower], [vid, Number.MAX_SAFE_INTEGER]), count);
          req.onsuccess = () => {
            const d = performance.now() - t0;
            try {
              const g = /** @type {any} */ (globalThis);
              if (d > (Number(g.__nlIdbChunkMs) || 0)) g.__nlIdbChunkMs = Math.round(d);
              g.__nlIdbChunkN = (Number(g.__nlIdbChunkN) || 0) + 1;
              g.__nlIdbChunkRows = Array.isArray(req.result) ? req.result.length : 0;
            } catch { /* 計器 */ }
            res(Array.isArray(req.result) ? req.result : []);
          };
          req.onerror = () => rej(req.error || new Error('idb_get_failed'));
        })
      }).then(resolve, reject);
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
 * その配信の記録の行数だけを数える(v0.1.1978)。行の中身は取り出さないので、8万行でもすぐ返る。
 *   横の欄が開いた直後に「記録 N 件」を出すために使う(全件の読み出しを待たない)。
 * @param {string} videoId
 * @returns {Promise<number>}
 */
export async function countYtStreamComments(videoId) {
  const vid = String(videoId || '').trim();
  if (!vid) return 0;
  const db = await openYtCommentsDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction([STORE_COMMENTS], 'readonly').objectStore(STORE_COMMENTS);
    // 全件読み(getYtStreamCommentsByVideoId)と同じ索引・同じ範囲で数える(数と中身がずれないように)
    const req = store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)
      ? store.index(INDEX_BY_VIDEO_ID_RECORDED_AT).count(IDBKeyRange.bound([vid, 0], [vid, Number.MAX_SAFE_INTEGER]))
      : store.index(INDEX_BY_VIDEO_ID).count(IDBKeyRange.only(vid));
    req.onsuccess = () => resolve(Number(req.result) || 0);
    req.onerror = () => reject(req.error || new Error('idb_count_failed'));
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
  const hasRecordedAt = await new Promise((resolve) => {
    const store = db.transaction([STORE_COMMENTS], 'readonly').objectStore(STORE_COMMENTS);
    resolve(store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT));
  });
  if (!hasRecordedAt) {
    return new Promise((resolve, reject) => {
      const index = db.transaction([STORE_COMMENTS], 'readonly').objectStore(STORE_COMMENTS).index(INDEX_BY_VIDEO_ID);
      const req = index.getAll(IDBKeyRange.only(vid));
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? req.result : [];
        list.sort((a, b) => Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
        resolve(lower > 0 ? list.filter((r) => Number(r?.recordedAt || 0) >= lower) : list);
      };
      req.onerror = () => reject(req.error || new Error('idb_get_since_failed'));
    });
  }
  // ★v0.1.2050: 新着のつもりが全件返っても、200行ずつ手を放す(1回の getAll が約1秒画面を止めていた)。
  return readYtRowsInChunks({
    startAt: lower,
    readChunk: (from, count) => new Promise((res, rej) => {
      const t0 = performance.now();
      const req = db.transaction([STORE_COMMENTS], 'readonly').objectStore(STORE_COMMENTS)
        .index(INDEX_BY_VIDEO_ID_RECORDED_AT)
        .getAll(IDBKeyRange.bound([vid, from], [vid, Number.MAX_SAFE_INTEGER]), count);
      req.onsuccess = () => {
        const d = performance.now() - t0;
        try {
          const g = /** @type {any} */ (globalThis);
          if (d > (Number(g.__nlIdbChunkMs) || 0)) g.__nlIdbChunkMs = Math.round(d);
          g.__nlIdbChunkN = (Number(g.__nlIdbChunkN) || 0) + 1;
          g.__nlIdbChunkRows = Array.isArray(req.result) ? req.result.length : 0;
        } catch { /* 計器 */ }
        res(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => rej(req.error || new Error('idb_get_since_failed'));
    })
  });
}

/**
 * 指定した pk の記録を消し、その配信の残りの件数を返す(切り替えで混ざった分の片付け用)。
 * @param {string} videoId
 * @param {string[]} pks
 * @returns {Promise<number>}
 */
export async function deleteYtCommentsByPks(videoId, pks) {
  const vid = String(videoId || '').trim();
  const db = await openYtCommentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readwrite');
    const store = tx.objectStore(STORE_COMMENTS);
    for (const pk of pks) store.delete(pk);
    let total = 0;
    const countReq = store.index(INDEX_BY_VIDEO_ID).count(IDBKeyRange.only(vid));
    countReq.onsuccess = () => {
      total = Number(countReq.result || 0);
    };
    tx.oncomplete = () => resolve(total);
    tx.onerror = () => reject(tx.error || new Error('idb_delete_failed'));
  });
}

/**
 * 全配信の記録を、紛れ込みの見分けに要る欄(pk・id・videoId・recordedAt・postedAtMs)だけにして読む(片付け用・1回きり)。
 * @returns {Promise<Array<{ pk: string, id: string, videoId: string, recordedAt: number, postedAtMs?: number }>>}
 */
export async function readAllYtCommentKeys() {
  const db = await openYtCommentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readonly');
    const req = tx.objectStore(STORE_COMMENTS).openCursor();
    /** @type {any[]} */
    const out = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const v = cur.value || {};
      out.push({ pk: String(v.pk || ''), id: String(v.id || ''), videoId: String(v.videoId || ''), recordedAt: Number(v.recordedAt || 0), postedAtMs: Number(v.postedAtMs || 0) });
      cur.continue();
    };
    req.onerror = () => reject(req.error || new Error('idb_cursor_failed'));
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error || new Error('idb_cursor_failed'));
  });
}

/**
 * pk を指定して消す(配信をまたいだ片付け用)。消した記録そのもの(控え・あとで戻せるように)と、
 * 消したあとの配信ごとの件数を返す。
 * @param {string[]} pks
 * @param {string[]} videoIds 件数を数え直す配信
 * @returns {Promise<{ totals: Record<string, number>, removed: any[] }>}
 */
export async function deleteYtCommentPksAcrossVideos(pks, videoIds) {
  const db = await openYtCommentsDb();
  /** @type {any[]} */
  const removed = await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readwrite');
    const store = tx.objectStore(STORE_COMMENTS);
    /** @type {any[]} */
    const out = [];
    for (const pk of pks) {
      const g = store.get(pk);
      g.onsuccess = () => {
        if (!g.result) return;
        out.push(g.result);
        store.delete(pk);
      };
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error || new Error('idb_delete_failed'));
  });
  /** @type {Record<string, number>} */
  const totals = await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readonly');
    const idx = tx.objectStore(STORE_COMMENTS).index(INDEX_BY_VIDEO_ID);
    /** @type {Record<string, number>} */
    const t = {};
    for (const vid of videoIds) {
      const c = idx.count(IDBKeyRange.only(vid));
      c.onsuccess = () => {
        t[vid] = Number(c.result || 0);
      };
    }
    tx.oncomplete = () => resolve(t);
    tx.onerror = () => reject(tx.error || new Error('idb_count_failed'));
  });
  return { totals, removed };
}

/**
 * pk を指定して記録そのものを読む(消す前に控えを取るため)。
 * @param {string[]} pks
 * @returns {Promise<any[]>}
 */
export async function getYtCommentsByPks(pks) {
  const db = await openYtCommentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_COMMENTS], 'readonly');
    const store = tx.objectStore(STORE_COMMENTS);
    /** @type {any[]} */
    const out = [];
    for (const pk of pks) {
      const g = store.get(pk);
      g.onsuccess = () => {
        if (g.result) out.push(g.result);
      };
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error || new Error('idb_get_failed'));
  });
}
