/**
 * 複数 `#nls-inline-popup-host` が `isConnected` なとき、どれを primary として残すか。
 * 面積最大を優先し、同面積は先頭インデックスのまま（安定）。
 *
 * @param {readonly { w: number, h: number }[]} rects `getBoundingClientRect` 由来の幅・高さ
 * @returns {number} `rects` 内のインデックス
 */
export function indexOfMaxRectArea(rects) {
  if (!rects.length) return 0;
  let best = 0;
  let bestArea = rectArea(rects[0]);
  for (let i = 1; i < rects.length; i++) {
    const a = rectArea(rects[i]);
    if (a > bestArea) {
      bestArea = a;
      best = i;
    }
  }
  return best;
}

/**
 * @param {{ w: number, h: number }} r
 * @returns {number}
 */
function rectArea(r) {
  const w = typeof r.w === 'number' && Number.isFinite(r.w) ? Math.max(0, r.w) : 0;
  const h = typeof r.h === 'number' && Number.isFinite(r.h) ? Math.max(0, r.h) : 0;
  return w * h;
}
