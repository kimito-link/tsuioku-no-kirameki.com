// ytMergedIsolation.js — 本体の拡張に同梱した YouTube 版を、ニコ生版から切り離す仕切り(2026-11-05 本体統合)。
//
// YouTube 版はニコ生版の画面とプログラムをそのまま写して動かしている(ytNicoShim がデータの入口だけ差し替える)。
//   別の拡張だったときは、保存場所(chrome.storage・IndexedDB)も、裏方(service worker)も、画面の名前も別々だった。
//   本体に同梱すると全部が1つになり、写したニコ生版のプログラムがニコ生版の設定・記録を読み書きしてしまう。
//   そこで YouTube 版の画面と視聴ページの中(content script)の入口で、次の4つを仕切る(ニコ生版のコードは触らない):
//
//   1. 保存(chrome.storage.local): YouTube 版自身の記録(yt_…)以外のキーは頭に「ytm:」を付けた別のキーへ。
//      ニコ生版のキーの変化は YouTube 版の画面に知らせない(逆も同じ)。=別の拡張だったときと同じ。
//   2. IndexedDB: YouTube の記録(yt_kirameki_db)以外は「ytm:」付きの別の DB を開く。
//   3. 画面の名前: sidepanel.html / comeview.html / venue.html / marketing-export.html / offscreen.html は
//      本体ではニコ生版の画面なので、YouTube 版の写し(yt-….html)へ振り替える。
//   4. 裏方への頼み(runtime.sendMessage): 別の拡張だったときに YouTube 版の裏方が答えていたものだけ通す。
//      ニコ生版の裏方だけが答えるもの(コメント DB への書き込み・ニコニコの API 取得など)は、疑似の配信番号で
//      ニコ生版の記録を汚すので送らない(返事なし=別の拡張だったときと同じ)。会場・コメビュを開く頼みは
//      YouTube 版の裏方の名前(YT_OPEN_…)に変える。

import { SUPPORTER_SHARED_KEY_PREFIX } from '../supporterAccess.js';

export const YT_MERGED_KEY_PREFIX = 'ytm:';
export const YT_OWN_IDB_NAME = 'yt_kirameki_db';

/** YouTube 版の画面(本体の中での名前) */
export const YT_MERGED_PAGES = Object.freeze({
  'sidepanel.html': 'yt-sidepanel.html',
  'comeview.html': 'yt-comeview.html',
  'venue.html': 'yt-venue.html',
  'marketing-export.html': 'yt-marketing-export.html',
  'offscreen.html': 'yt-offscreen.html',
});

/** 別の拡張だったときに YouTube 版の裏方が答えていた頼み(ニコ生版と同じ受け口の写し) */
const PASS_MESSAGE_TYPES = new Set([
  'NLS_VOICE_ENGINE_ACTIVITY',
  'NLS_VOICE_ENGINE_QUIET',
  'NLS_VOICE_READER_CLAIM',
  'NLS_VOICE_READER_RELEASE',
  'NLS_FETCH_PROXY',
]);
/** 名前を変えて YouTube 版の裏方へ */
export const YT_MERGED_RENAMED_MESSAGES = Object.freeze({
  NLS_OPEN_COMEVIEW: 'YT_OPEN_COMEVIEW',
  NLS_OPEN_VENUE: 'YT_OPEN_VENUE',
});

/**
 * ニコ生版と YouTube 版で共有するキーの頭(v0.1.1893 課金: サポーターのコード・証明書は1人1つ)。
 */
export const YT_MERGED_SHARED_KEY_PREFIXES = Object.freeze([SUPPORTER_SHARED_KEY_PREFIX]);

/** @param {string} s */
function isSharedKey(s) {
  return YT_MERGED_SHARED_KEY_PREFIXES.some((p) => s.startsWith(p));
}

/** @param {string} k */
export function ytMergedStorageKey(k) {
  const s = String(k);
  return s.startsWith('yt_') || isSharedKey(s) || s.startsWith(YT_MERGED_KEY_PREFIX) ? s : YT_MERGED_KEY_PREFIX + s;
}

/** 保存場所のキー → YouTube 版の画面から見えるキー(見せないものは null) @param {string} k */
export function ytMergedVisibleKey(k) {
  const s = String(k);
  if (s.startsWith('yt_') || isSharedKey(s)) return s;
  if (s.startsWith(YT_MERGED_KEY_PREFIX)) return s.slice(YT_MERGED_KEY_PREFIX.length);
  return null;
}

/** @param {string} name */
export function ytMergedIdbName(name) {
  const s = String(name);
  return s === YT_OWN_IDB_NAME || s.startsWith(YT_MERGED_KEY_PREFIX) ? s : YT_MERGED_KEY_PREFIX + s;
}

/**
 * 画面の名前を YouTube 版の写しへ(先頭の / と後ろの ?… #… は残す)。ほかの道(画像・音)はそのまま。
 * @param {string} path
 */
export function ytMergedPagePath(path) {
  const s = String(path ?? '');
  const m = /^(\/?)([a-z-]+\.html)([?#*].*)?$/i.exec(s);
  if (!m) return s;
  const to = /** @type {Record<string, string>} */ (YT_MERGED_PAGES)[m[2]];
  return to ? `${m[1]}${to}${m[3] || ''}` : s;
}

/**
 * 裏方への頼みを YouTube 版向けに直す。送らないものは null。
 * @param {any} msg
 */
export function ytMergedOutgoingMessage(msg) {
  const type = msg && typeof msg.type === 'string' ? msg.type : '';
  if (!type) return null;
  if (type.startsWith('YT_')) return msg;
  const renamed = /** @type {Record<string, string>} */ (YT_MERGED_RENAMED_MESSAGES)[type];
  if (renamed) return { ...msg, type: renamed };
  return PASS_MESSAGE_TYPES.has(type) ? msg : null;
}

/** @param {any} keys */
function mapGetKeys(keys) {
  if (keys == null) return null;
  if (typeof keys === 'string') return ytMergedStorageKey(keys);
  if (Array.isArray(keys)) return keys.map(ytMergedStorageKey);
  if (typeof keys === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(keys)) out[ytMergedStorageKey(k)] = v;
    return out;
  }
  return keys;
}

/** @param {Record<string, any> | null | undefined} bag */
function unmapBag(bag) {
  /** @type {Record<string, any>} */
  const out = {};
  if (!bag || typeof bag !== 'object') return out;
  for (const [k, v] of Object.entries(bag)) {
    const vis = ytMergedVisibleKey(k);
    if (vis != null) out[vis] = v;
  }
  return out;
}

/**
 * promise でも callback でも呼べる形にする(chrome.* と同じ)
 * @param {Promise<any>} p
 * @param {any} cb
 */
function settle(p, cb) {
  if (typeof cb === 'function') {
    p.then((v) => cb(v), () => cb(undefined));
    return undefined;
  }
  return p;
}

/**
 * chrome.storage.local を仕切る。
 * @param {any} area chrome.storage.local
 */
function isolateStorageArea(area) {
  const get = area.get.bind(area);
  const set = area.set.bind(area);
  const remove = typeof area.remove === 'function' ? area.remove.bind(area) : null;
  const bytes = typeof area.getBytesInUse === 'function' ? area.getBytesInUse.bind(area) : null;
  area.get = (/** @type {any} */ keys, /** @type {any} */ cb) => {
    if (typeof keys === 'function') {
      cb = keys;
      keys = null;
    }
    return settle(Promise.resolve(get(mapGetKeys(keys))).then(unmapBag), cb);
  };
  area.set = (/** @type {any} */ items, /** @type {any} */ cb) => {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(items || {})) out[ytMergedStorageKey(k)] = v;
    return settle(Promise.resolve(set(out)), cb);
  };
  if (remove) {
    area.remove = (/** @type {any} */ keys, /** @type {any} */ cb) => settle(Promise.resolve(remove(mapGetKeys(keys))), cb);
  }
  if (bytes) {
    area.getBytesInUse = (/** @type {any} */ keys, /** @type {any} */ cb) => {
      if (typeof keys === 'function') {
        cb = keys;
        keys = null;
      }
      return settle(Promise.resolve(bytes(mapGetKeys(keys))), cb);
    };
  }
  // 全部消す = YouTube 版の分だけ消す(ニコ生版の記録・設定は残す)
  area.clear = (/** @type {any} */ cb) =>
    settle(
      Promise.resolve(get(null)).then((bag) => {
        const mine = Object.keys(bag || {}).filter((k) => ytMergedVisibleKey(k) != null);
        return mine.length && remove ? remove(mine) : undefined;
      }),
      cb,
    );
}

/**
 * storage の変化の知らせを仕切る(local だけ。ニコ生版のキーの変化は知らせない)。
 * @param {any} ev chrome.storage.onChanged か chrome.storage.local.onChanged
 * @param {boolean} perArea local.onChanged か(引数に area が来ない)
 */
function isolateOnChanged(ev, perArea) {
  if (!ev || typeof ev.addListener !== 'function') return;
  const add = ev.addListener.bind(ev);
  const rm = typeof ev.removeListener === 'function' ? ev.removeListener.bind(ev) : null;
  const has = typeof ev.hasListener === 'function' ? ev.hasListener.bind(ev) : null;
  /** @type {WeakMap<Function, Function>} */
  const wrapped = new WeakMap();
  ev.addListener = (/** @type {Function} */ fn) => {
    if (typeof fn !== 'function' || wrapped.has(fn)) return;
    const w = (/** @type {any} */ changes, /** @type {string} */ area) => {
      if (!perArea && area !== 'local') return fn(changes, area);
      const vis = unmapBag(changes);
      if (!Object.keys(vis).length) return undefined;
      return perArea ? fn(vis) : fn(vis, area);
    };
    wrapped.set(fn, w);
    add(w);
  };
  if (rm) {
    ev.removeListener = (/** @type {Function} */ fn) => {
      const w = wrapped.get(fn);
      if (w) {
        wrapped.delete(fn);
        rm(w);
      }
    };
  }
  if (has) ev.hasListener = (/** @type {Function} */ fn) => wrapped.has(fn);
}

/**
 * @param {any} idb indexedDB
 */
function isolateIndexedDb(idb) {
  if (!idb || typeof idb.open !== 'function') return;
  const open = idb.open.bind(idb);
  idb.open = (/** @type {string} */ name, /** @type {any[]} */ ...rest) => open(ytMergedIdbName(name), ...rest);
  if (typeof idb.deleteDatabase === 'function') {
    const del = idb.deleteDatabase.bind(idb);
    idb.deleteDatabase = (/** @type {string} */ name) => del(ytMergedIdbName(name));
  }
}

/**
 * @param {any} runtime chrome.runtime
 */
function isolateRuntime(runtime) {
  if (typeof runtime.getURL === 'function') {
    const getURL = runtime.getURL.bind(runtime);
    runtime.getURL = (/** @type {string} */ p) => getURL(ytMergedPagePath(p));
  }
  if (typeof runtime.sendMessage === 'function') {
    const send = runtime.sendMessage.bind(runtime);
    runtime.sendMessage = (/** @type {any[]} */ ...args) => {
      // (extensionId?, message, options?, callback?) のうち message を探す
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      const idx = typeof args[0] === 'string' && args.length > 1 && typeof args[1] === 'object' ? 1 : 0;
      const next = ytMergedOutgoingMessage(args[idx]);
      if (!next) {
        // 返事なし(別の拡張だったときに受け口が無かったのと同じ)
        if (cb) {
          setTimeout(() => cb(undefined), 0);
          return undefined;
        }
        return Promise.resolve(undefined);
      }
      const a = args.slice();
      a[idx] = next;
      return send(...a);
    };
  }
}

/**
 * YouTube 版の入口(画面・視聴ページの中)で最初に1回だけ呼ぶ。
 * @param {{ chrome?: any, indexedDB?: any }} env
 * @returns {boolean} 仕切ったか
 */
export function installYtMergedIsolation(env) {
  const c = env && env.chrome;
  if (!c || !c.runtime || c.__ytMergedIsolated) return false;
  try {
    Object.defineProperty(c, '__ytMergedIsolated', { value: true, configurable: true });
  } catch {
    c.__ytMergedIsolated = true;
  }
  if (c.storage?.local) {
    isolateStorageArea(c.storage.local);
    isolateOnChanged(c.storage.local.onChanged, true);
  }
  isolateOnChanged(c.storage?.onChanged, false);
  isolateIndexedDb(env.indexedDB);
  isolateRuntime(c.runtime);
  return true;
}
