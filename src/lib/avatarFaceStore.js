/**
 * 【層】L2 配線層(IndexedDB へ読み書きする・DOM/chrome.* には触れない)
 * 【この箱に入るもの】匿名アイコンの「合成した顔」(PNG の data URL)を、拡張を開き直しても使い回すための永続キャッシュ
 * 【この箱に入らないもの】顔の合成そのもの(avatarPartsComposer.js)・描画
 * 【書けるstorageキー】なし(専用の IndexedDB `nls_avatar_face_v1` だけ。chrome.storage は使わない)
 * 【正本宣言】合成済みの顔の永続化はこのファイルのみ
 *
 * avatarFaceStore.js — v0.1.1680
 *
 * ■ なぜ要るか(2026-10-19・実機の保存データを写したヘッドレスの V8 CPU プロファイル)
 *   パネルを開くたびに popup が新しく起動し、メモリ上の顔キャッシュ(256件)は空から始まる。
 *   そのため【開くたびに同じ匿名の顔を canvas で作り直し】、canvas.toBlob(`blob` 関数)が拡張プロセスの
 *   メインスレッド時間の大半を占めていた(忙しい区間の関数別サンプルのうち `blob` が約 98%・1回の開閉で約2.7秒)。
 *   作った顔を IndexedDB に残して次回以降は読むだけにする。見た目(最終的な画像)は同じ。
 *
 * ■ 守ること
 *   - 失敗は全部握る(IDB 不在・容量超過・壊れた値)=従来どおり作り直すだけ。機能を失わない。
 *   - 読みはまとめる(同じ tick の get は 1 つのトランザクション)・書きもまとめる(1秒に1回)。
 *   - 合成の見た目を変えたら FACE_RENDER_VERSION を上げる(古い顔を使わない)。
 *   - 上限 2000 件(約 46MB)。超えたら古い書き込み順に捨てる。
 *
 * @module avatarFaceStore
 */

export const AVATAR_FACE_DB_NAME = 'nls_avatar_face_v1';
export const AVATAR_FACE_STORE_NAME = 'faces';
/** 合成の見た目(パーツ・配置・色の計算)を変えたら上げる。 */
export const FACE_RENDER_VERSION = 1;
export const AVATAR_FACE_MAX_ENTRIES = 2000;
const PNG_PREFIX = 'data:image/png;base64,';
const PRUNE_EVERY_MS = 60_000;

/**
 * @param {{
 *   indexedDBRef?: IDBFactory | null,
 *   now?: () => number,
 *   setTimeoutRef?: (fn: () => void, ms: number) => unknown,
 *   flushMs?: number,
 *   maxEntries?: number
 * }} [deps]
 */
export function createAvatarFaceStore(deps = {}) {
  const idb = deps.indexedDBRef !== undefined ? deps.indexedDBRef : typeof indexedDB !== 'undefined' ? indexedDB : null;
  const now = deps.now || (() => Date.now());
  const later = deps.setTimeoutRef || ((fn, ms) => setTimeout(fn, ms));
  const flushMs = deps.flushMs ?? 1000;
  const maxEntries = deps.maxEntries ?? AVATAR_FACE_MAX_ENTRIES;

  /** @type {Promise<IDBDatabase | null> | null} */
  let dbPromise = null;
  const openDb = () => {
    if (!idb) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = idb.open(AVATAR_FACE_DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(AVATAR_FACE_STORE_NAME)) {
            const os = db.createObjectStore(AVATAR_FACE_STORE_NAME, { keyPath: 'k' });
            os.createIndex('byTime', 't', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }).then((db) => {
      if (!db) dbPromise = null; // 次の呼び出しで開き直せる
      return db;
    });
    return dbPromise;
  };

  /** @param {string} userKey */
  const fullKey = (userKey) => `${FACE_RENDER_VERSION}:${userKey}`;

  /** @type {Map<string, Array<(v: string) => void>>} */
  let pendingGets = new Map();
  let getScheduled = false;

  const flushGets = async () => {
    getScheduled = false;
    const batch = pendingGets;
    pendingGets = new Map();
    /** @type {Map<string, string>} */
    const found = new Map();
    try {
      const db = await openDb();
      if (db) {
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(AVATAR_FACE_STORE_NAME, 'readonly');
            const os = tx.objectStore(AVATAR_FACE_STORE_NAME);
            for (const key of batch.keys()) {
              const r = os.get(fullKey(key));
              r.onsuccess = () => {
                const rec = r.result;
                if (rec && typeof rec.u === 'string' && rec.u.startsWith(PNG_PREFIX)) found.set(key, rec.u);
              };
            }
            tx.oncomplete = () => resolve(undefined);
            tx.onerror = () => resolve(undefined);
            tx.onabort = () => resolve(undefined);
          } catch {
            resolve(undefined);
          }
        });
      }
    } catch {
      /* 読めなければ「無い」として従来どおり作る */
    }
    for (const [key, resolvers] of batch) {
      const v = found.get(key) || '';
      for (const r of resolvers) r(v);
    }
  };

  /** @type {Map<string, string>} */
  let pendingPuts = new Map();
  let putScheduled = false;
  let lastPruneAt = 0;
  /** 直近の書き込み(と掃除)の完了。テストが「書き終わった」を確実に待つため。 @type {Promise<void>} */
  let lastFlush = Promise.resolve();

  const flushPuts = async () => {
    putScheduled = false;
    const batch = pendingPuts;
    pendingPuts = new Map();
    if (batch.size === 0) return;
    try {
      const db = await openDb();
      if (!db) return;
      const t = now();
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(AVATAR_FACE_STORE_NAME, 'readwrite');
          const os = tx.objectStore(AVATAR_FACE_STORE_NAME);
          for (const [key, url] of batch) os.put({ k: fullKey(key), u: url, t });
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      });
      if (t - lastPruneAt >= PRUNE_EVERY_MS) {
        lastPruneAt = t;
        await prune(db);
      }
    } catch {
      /* 書けなくても次回また作るだけ */
    }
  };

  /** @param {IDBDatabase} db */
  const prune = (db) =>
    new Promise((resolve) => {
      try {
        const tx = db.transaction(AVATAR_FACE_STORE_NAME, 'readwrite');
        const os = tx.objectStore(AVATAR_FACE_STORE_NAME);
        const countReq = os.count();
        countReq.onsuccess = () => {
          let excess = countReq.result - maxEntries;
          if (excess <= 0) return;
          const cur = os.index('byTime').openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c || excess <= 0) return;
            c.delete();
            excess -= 1;
            c.continue();
          };
        };
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });

  return {
    /**
     * 作り済みの顔(PNG の data URL)を返す。無ければ ''。同じ tick の呼び出しは 1 回の読みにまとめる。
     * @param {string} userKey
     * @returns {Promise<string>}
     */
    get(userKey) {
      const key = String(userKey || '');
      if (!key || !idb) return Promise.resolve('');
      return new Promise((resolve) => {
        const list = pendingGets.get(key);
        if (list) list.push(resolve);
        else pendingGets.set(key, [resolve]);
        if (!getScheduled) {
          getScheduled = true;
          later(() => void flushGets(), 0);
        }
      });
    },
    /**
     * 作った顔を覚えさせる(まとめて書く・1秒に1回)。PNG の data URL 以外は無視。
     * @param {string} userKey
     * @param {string} dataUrl
     */
    put(userKey, dataUrl) {
      const key = String(userKey || '');
      if (!key || !idb || typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_PREFIX)) return;
      pendingPuts.set(key, dataUrl);
      if (!putScheduled) {
        putScheduled = true;
        later(() => { lastFlush = flushPuts(); }, flushMs);
      }
    },
    /** テスト用: 書きをいま流す。 */
    flushNow: async () => {
      putScheduled = false;
      lastFlush = flushPuts();
      await lastFlush;
    },
    /** テスト用: 予約済みの書き込みが終わるまで待つ(掃除を含む)。 */
    idle: () => lastFlush
  };
}

/** @type {ReturnType<typeof createAvatarFaceStore> | null | undefined} */
let defaultStore;

/** 既定の永続キャッシュ(IndexedDB が無い環境は null=従来どおり毎回作る)。 */
export function getDefaultAvatarFaceStore() {
  if (defaultStore !== undefined) return defaultStore;
  defaultStore = typeof indexedDB !== 'undefined' ? createAvatarFaceStore() : null;
  return defaultStore;
}
