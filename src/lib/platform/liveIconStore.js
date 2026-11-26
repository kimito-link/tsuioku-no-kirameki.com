/**
 * v0.1.2254: ライブで分かった顔(名前 → 顔の URL)を storage(yt_tw_icons など)に置くときの、純粋な部品。
 *   今までは「400ms に間に合わなかった人」だけを置いていたので、録画(twVodLiveIcons.js)が引ける顔がほとんど無かった。
 *   間に合った人も同じ場所に置く。上限(既存の 3000)を超えたら古い順に捨てる(際限なく増やさない)。
 *   通信・タイマー・見張りはここに無い。書く時機は呼び出し側の既存のまとめ書き(saveLateIconsSoon)に任せる。
 */

/**
 * 1人ぶんを覚える。変わったときだけ true(同じ URL なら書かなくてよい)。
 * 覚え直した人は「いちばん新しい」位置へ動かす(上限で捨てるのは古い人から)。
 * @param {Record<string, string>} store
 * @param {string} name
 * @param {string} url
 * @returns {boolean}
 */
export function rememberLiveIcon(store, name, url) {
  const k = String(name || '').trim().toLowerCase();
  const u = String(url || '').trim();
  if (!k || !/^https:\/\//.test(u) || !store || typeof store !== 'object') return false;
  if (store[k] === u) return false;
  delete store[k];
  store[k] = u;
  return true;
}

/**
 * storage にある分(ほかのタブが書いた分を含む)と、このタブが覚えた分を合わせる。
 * このタブの分を新しい側に置き、上限を超えたら古い順に捨てる。
 * @param {unknown} saved storage の値
 * @param {Record<string, string>} mine このタブが覚えた分(新しい順に並んでいる)
 * @param {number} max
 * @returns {Record<string, string>}
 */
export function mergeLiveIconStore(saved, mine, max) {
  /** @type {Record<string, string>} */
  const out = {};
  const own = mine && typeof mine === 'object' ? mine : {};
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (saved))) {
      if (Object.prototype.hasOwnProperty.call(own, k)) continue;
      if (typeof v === 'string' && /^https:\/\//.test(v)) out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(own)) out[k] = v;
  const keys = Object.keys(out);
  const cap = Math.max(0, Math.floor(Number(max) || 0));
  if (keys.length > cap) for (const k of keys.slice(0, keys.length - cap)) delete out[k];
  return out;
}
