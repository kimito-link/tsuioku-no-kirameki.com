/**
 * 匿名 userId 向けの決定論的 Identicon（SVG data URL）。
 * ニコ公式では同一シルエットになり得るため、拡張内でユーザーを区別しやすくする用途。
 */

/**
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {unknown} userId
 * @param {number} [sizePx]
 * @returns {string} 空 userId のとき空文字
 */
export function anonymousIdenticonDataUrl(userId, sizePx = 64) {
  const s = String(userId || '').trim();
  if (!s) return '';

  const n = Math.max(16, Math.min(128, Number(sizePx) || 64));
  const h = hashString(s);
  const hue = (h >>> 15) % 360;
  const bg = `hsl(${hue},48%,90%)`;
  const fg = `hsl(${hue},55%,28%)`;

  let bits = h & 0x7fff;
  const cell = n / 5;
  let rects = '';
  for (let r = 0; r < 5; r += 1) {
    const a = (bits & 1) !== 0;
    bits >>>= 1;
    const b = (bits & 1) !== 0;
    bits >>>= 1;
    const c = (bits & 1) !== 0;
    bits >>>= 1;
    /** @type {[number, boolean][]} */
    const cols = [
      [0, a],
      [4, a],
      [1, b],
      [3, b],
      [2, c]
    ];
    for (const [ci, on] of cols) {
      if (on) {
        rects += `<rect x="${ci * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${fg}"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="100%" height="100%" fill="${bg}"/>${rects}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
