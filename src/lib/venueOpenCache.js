/**
 * venueOpenCache.js — 「会場モードが開いているか」を安く保持する。
 *
 * ★なぜ storage を毎tick読まないか
 *   ①POP の tick は 3秒ごとに回る。ここで storage read を足すと
 *   単一LevelDB の競合を増やし、診断が重くなる既知の地雷を踏む
 *   ([[status-extras-read-not-core-read]])。
 *   → **onChanged で更新される変数**を持ち、tick は同期で読むだけにする。
 *
 * ★fail-open にする理由
 *   読めないとき `false`(会場は閉じている)に倒すと、
 *   **会場が開いているのに鏡を書かない**=いま直している症状そのものが再発する。
 *   ここは「分からないなら書く」が安全側([[fail-open-recurs-under-new-names-2026-08-12]]
 *   の逆で、こちらは書く方が無害=storage set 1回で済む)。
 *
 * @module venueOpenCache
 */

/** 会場が開いているかの storage キー(venueBar.js の OPEN_STORAGE_KEY と同値)。 */
export const KEY_VENUE_OPEN = 'nls_venue_open';

/** @type {boolean} 直近の値。初期値 true=不明なら書く(fail-open)。 */
let _venueOpen = true;

/** @returns {boolean} */
export function isVenueOpenCached() {
  return _venueOpen;
}

/**
 * storage の生値を取り込む。
 * @param {unknown} raw
 * @returns {boolean} 取り込み後の値
 */
export function setVenueOpenFromRaw(raw) {
  // venueBar.js は真偽値/オブジェクトのどちらでも書きうるので広く受ける。
  if (raw == null) {
    // ★キーが無い=一度も会場を開いていない。この場合だけ false に倒してよい
    //   (読み手が存在しないので書かなくても誰も困らない)。
    _venueOpen = false;
    return _venueOpen;
  }
  if (typeof raw === 'boolean') { _venueOpen = raw; return _venueOpen; }
  if (typeof raw === 'object') {
    const o = /** @type {any} */ (raw);
    if (typeof o.open === 'boolean') { _venueOpen = o.open; return _venueOpen; }
    if (typeof o.enabled === 'boolean') { _venueOpen = o.enabled; return _venueOpen; }
    _venueOpen = true; // 形が不明=書く側に倒す
    return _venueOpen;
  }
  _venueOpen = Boolean(raw);
  return _venueOpen;
}

/** テスト用リセット。 */
export function _resetVenueOpenCache() {
  _venueOpen = true;
}

/**
 * storage を購読して自動追従する(副作用・popup 側から1回だけ呼ぶ)。
 * ★毎tick read しない=単一LevelDBの競合を増やさない。
 * @param {any} [chromeApi]
 */
export function watchVenueOpen(chromeApi) {
  try {
    const api = chromeApi || globalThis.chrome;
    const local = api?.storage?.local;
    if (!local?.get) return;
    void local.get(KEY_VENUE_OPEN)
      .then((/** @type {any} */ bag) => setVenueOpenFromRaw(bag?.[KEY_VENUE_OPEN]))
      .catch(() => { /* 不明のまま=書く側に倒れる */ });
    api?.storage?.onChanged?.addListener?.((/** @type {any} */ changes, /** @type {any} */ area) => {
      if (area !== 'local' || !changes || !(KEY_VENUE_OPEN in changes)) return;
      setVenueOpenFromRaw(changes[KEY_VENUE_OPEN]?.newValue);
    });
  } catch {
    /* 購読に失敗しても既定(書く)で動く */
  }
}
