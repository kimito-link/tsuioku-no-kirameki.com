/**
 * 【層】L0 判定層(純粋関数・I/O禁止。時計は引数で受け取る)
 * 【この箱に入るもの】chrome.storage.local の【1つのキー】の値を、ページの中に記憶しておく規則
 * 【この箱に入らないもの】storage の読み書きそのもの・DOM(呼び出し側 popup-entry.js が行う)
 * 【書けるstorageキー】なし
 * 【正本宣言】「巨大なキーを何度も読み直さない」ための記憶の規則はこのファイルのみ
 *
 * ★なぜ(2026-10-16・黒い幕の実測 boot-profile --gets): パネル起動の8秒間に chrome.storage.local.get が約450回・結果12MB。
 *   同じ 360KB の組(プロフィール cache 332KB を含む)を12〜14回、較正の記録 820KB を2回(さらに5秒ごと)読み直していた。
 *   重複読みを止める実験で、稼働率の平均 81% → 60%・ブラウザ内部の処理 5.8秒 → 4.1秒。
 *
 * ★過去の地雷への備え(コードに「読みをキャッシュで包むのは過去2回 revert した」との警告あり)。古い値を出し続けないために:
 *   1. storage.onChanged の newValue を【権威】にする(他のページ=content などが書いた最新が、読み直し無しで届く)。削除も反映する。
 *   2. 記憶には【寿命】(既定60秒)。過ぎたら必ず読み直す(onChanged が届かない万一でも、古さに上限がある)。
 *   3. 読み出しの最中に onChanged が来たら、先に始めた【古い読み出し結果で上書きしない】(version 照合)。
 *   4. 読み出しの結果にキーが【無い】ときは記憶しない(読み取りの失敗・タイムアウトで {} が返ったとき『無い』と覚えて、
 *      以後ずっと読まなくなる事故を防ぐ)。
 * @module storageKeyMemo
 */

/** 記憶の既定の寿命(ms)。 */
export const STORAGE_KEY_MEMO_MAX_AGE_MS = 60_000;

/**
 * @param {string} key chrome.storage.local のキー
 * @param {{ maxAgeMs?: number }} [opts]
 */
export function createStorageKeyMemo(key, opts = {}) {
  const maxAgeMs = Number(opts.maxAgeMs) > 0 ? Number(opts.maxAgeMs) : STORAGE_KEY_MEMO_MAX_AGE_MS;
  let loaded = false;
  /** @type {unknown} */ let value = undefined;
  let loadedAtMs = 0;
  let version = 0;
  const has = (/** @type {any} */ o) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, key);
  return {
    key,
    /** 記憶があり、寿命内か。false なら呼び出し側は読み直す。 */
    isFresh: (/** @type {number} */ nowMs) => loaded && Number(nowMs) - loadedAtMs < maxAgeMs && Number(nowMs) >= loadedAtMs,
    get: () => value,
    /** 読み出しを始める前に取る。absorbBag に渡して、読み出し中の変化を検知する。 */
    version: () => version,
    /**
     * 読み出した結果(bag)を記憶する。キーが無い・読み出し中に変化があった(version が違う)なら記憶しない。
     * @param {any} bag @param {number} startedVersion @param {number} nowMs
     * @returns {boolean} 記憶したか
     */
    absorbBag(bag, startedVersion, nowMs) {
      if (!has(bag) || startedVersion !== version) return false;
      value = bag[key];
      loaded = true;
      loadedAtMs = Number(nowMs) || 0;
      version += 1;
      return true;
    },
    /**
     * chrome.storage.onChanged の通知。このキーの変化だけを権威として取り込む(削除=newValue 無しも)。
     * @param {any} changes @param {string} area @param {number} nowMs
     * @returns {boolean} このキーの変化だったか
     */
    onChanged(changes, area, nowMs) {
      if (area !== 'local' || !has(changes)) return false;
      const c = changes[key];
      value = c && typeof c === 'object' ? c.newValue : undefined;
      loaded = true;
      loadedAtMs = Number(nowMs) || 0;
      version += 1;
      return true;
    },
    isLoaded: () => loaded,
    /** 記憶を捨てる(配信の切り替えなど)。 */
    invalidate() { loaded = false; value = undefined; version += 1; }
  };
}
