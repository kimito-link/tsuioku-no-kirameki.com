// ytPseudoLv.js — YouTube の videoId から決まった疑似 lv(lv9 + 11桁)を作る純粋関数。
//   ytNicoShim.js(画面)と background(同接の記録)で同じ答えを出すために切り出した(2026-11-05)。

/** @param {string} videoId @returns {string} */
export function computePseudoLvForVideoId(videoId) {
  const id = String(videoId || '');
  if (!id) return '';
  // FNV-1a 64bit 相当を 2 本の 32bit で作り、12桁に丸める(衝突は実用上起きない)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < id.length; i += 1) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  const n = ((h1 % 1000000) * 1000000 + (h2 % 1000000)) % 1000000000000;
  return `lv${String(9 * 100000000000 + (n % 100000000000))}`;
}
