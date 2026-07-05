/**
 * safeStorageLocal.js
 * v0.1.1080: 拡張リロード後の古いタブ(stale content script / iframe)が
 *   `chrome.storage.local` を素で呼んで投げる同期 TypeError
 *   (`Cannot read properties of undefined (reading 'local')`) を黙過する
 *   唯一の入口。
 *
 * 背景(実機で確認): v0.1.1071〜1079 で追加したマイ効果音・ボイス/BGM/フェーズ/操作音の
 *   計器コードが `chrome.storage.local.get/set` や `chrome.storage.onChanged` を
 *   直接呼んでいた。拡張がリロードされると、開きっぱなしの古い watch タブ(popup-entry.js
 *   の inline iframe / venueBar.js の会場レイヤー)では `chrome` グローバルの一部が
 *   無効化され、`chrome.storage` 自体が undefined になる。`.catch()` は非同期 reject にしか
 *   効かないため、`chrome.storage.local` へのプロパティアクセスそのものが投げる【同期】
 *   TypeError は捕まらず、chrome://extensions のエラー一覧に uncaught として残っていた
 *   (content-entry.js 7550行付近の確立パターン「入口に集約し、context invalidated は
 *   古いタブの正常な廃棄として黙過する」と同型の穴)。
 *
 * 設計:
 *   - `isExtensionContextAlive`(../lib/reportSilentError.js)を先頭で確認し、無効なら
 *     即 no-op / 既定値解決(get は空オブジェクト解決)で返す。
 *   - 万一チェック〜実呼び出しの間に invalidate する race(既存 setStorageLocalSilent と同じ
 *     窓)に備え、同期 throw も try/catch で拾う。
 *   - 正常環境(chrome.storage が生きている)では余計なラップを増やさず、そのまま
 *     chrome.storage.local.get/set/onChanged に委譲する(挙動不変)。
 */

import { isExtensionContextAlive } from './reportSilentError.js';

/**
 * @param {{ runtime?: unknown, storage?: { local?: unknown, onChanged?: unknown } }} [chromeRef]
 *   省略時は globalThis.chrome。
 * @returns {any} 有効な chrome.storage.local 参照。無効なら null。
 */
function resolveStorageLocal(chromeRef) {
  try {
    const c =
      chromeRef !== undefined
        ? chromeRef
        : /** @type {any} */ (typeof chrome !== 'undefined' ? chrome : undefined);
    if (!isExtensionContextAlive(c)) return null;
    return c.storage.local;
  } catch {
    return null;
  }
}

/**
 * chrome.storage.local.get の安全版。context invalidated / storage 未定義なら
 *   空オブジェクトへ解決する(get の「キーが無い」既定挙動と同型に倒す=呼び出し側の
 *   `bag?.[KEY]` パターンをそのまま使い続けられる)。
 * @param {string|string[]|Record<string, unknown>|null|undefined} [keys]
 * @param {{ chromeRef?: unknown }} [opts]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function safeStorageLocalGet(keys, opts = {}) {
  const local = resolveStorageLocal(opts.chromeRef);
  if (!local) return {};
  try {
    return (await local.get(keys)) || {};
  } catch {
    return {};
  }
}

/**
 * chrome.storage.local.set の安全版(fire-and-forget 前提の呼び出し元でも await 可能)。
 *   context invalidated / storage 未定義なら何もしない。
 * @param {Record<string, unknown>} items
 * @param {{ chromeRef?: unknown }} [opts]
 * @returns {Promise<void>}
 */
export async function safeStorageLocalSet(items, opts = {}) {
  const local = resolveStorageLocal(opts.chromeRef);
  if (!local) return;
  try {
    await local.set(items);
  } catch {
    // no-op: context invalidated 等は古いタブの正常な廃棄として黙過。
  }
}

/**
 * chrome.storage.local.remove の安全版。
 * @param {string|string[]} keys
 * @param {{ chromeRef?: unknown }} [opts]
 * @returns {Promise<void>}
 */
export async function safeStorageLocalRemove(keys, opts = {}) {
  const local = resolveStorageLocal(opts.chromeRef);
  if (!local) return;
  try {
    await local.remove(keys);
  } catch {
    // no-op
  }
}

/**
 * chrome.storage.onChanged.addListener の安全版。context invalidated / storage 未定義な
 *   環境(テスト含む)では登録自体をスキップする(呼び出し側は if 分岐を書かなくてよい)。
 * @param {(changes: Record<string, { newValue?: unknown, oldValue?: unknown }>, area: string) => void} listener
 * @param {{ chromeRef?: unknown }} [opts]
 * @returns {boolean} true=登録できた
 */
export function safeStorageOnChangedAddListener(listener, opts = {}) {
  try {
    const c =
      opts.chromeRef !== undefined
        ? opts.chromeRef
        : /** @type {any} */ (typeof chrome !== 'undefined' ? chrome : undefined);
    if (!isExtensionContextAlive(c) || typeof c?.storage?.onChanged?.addListener !== 'function') {
      return false;
    }
    c.storage.onChanged.addListener(listener);
    return true;
  } catch {
    return false;
  }
}

/** get が空オブジェクト解決・set が no-op の安全な `{ get, set }` シム(常に例外を投げない)。 */
const NOOP_STORAGE_LOCAL_REF = Object.freeze({
  get: async () => ({}),
  set: async () => {}
});

/**
 * `chrome.storage.local` そのものを引数として渡す呼び出し元向け(例: customSoundStore.js の
 *   `bumpCustomSoundRev(storageLocal)`)。呼び出し側で `chrome.storage.local` を直接式評価
 *   すると、context invalidated 時に「引数評価そのもの」が同期 throw して呼び出し前に
 *   落ちる(try/catch が無い呼び出し元だと unhandled になる)。常に呼び出し可能な
 *   `{ get, set }` を返すことで、この式評価による同期 throw を無くす。
 * @param {{ chromeRef?: unknown }} [opts]
 * @returns {{ get: (keys?: unknown) => Promise<Record<string, unknown>>, set: (items: Record<string, unknown>) => Promise<void> }}
 */
export function safeStorageLocalRef(opts = {}) {
  const local = resolveStorageLocal(opts.chromeRef);
  return local || NOOP_STORAGE_LOCAL_REF;
}
