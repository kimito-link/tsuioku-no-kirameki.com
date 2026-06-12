/**
 * 匿名 userId 向けの決定論的アバター（SVG data URL）。
 * ニコ公式では同一シルエットになり得るため、拡張内でユーザーを区別しやすくする用途。
 *
 * v0.1.700: 5×5 幾何学模様（「AIっぽくて怖い」とユーザー指摘）→ ゆっくり風の丸顔に変更。
 *   ゆっくりりんく/こんた/たぬ姉と同じタッチの、男女どちらにも見える優しい顔。
 *   肌5×髪色12×髪型4×目3×口3×頬2 = 4,320通りを userId ハッシュから決定論導出
 *   （同じ人はいつも同じ顔・端末を跨いでも同じ）。
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

/** 肌色（柔らかい暖色系のみ＝性別ニュートラル） */
const SKIN_TONES = ['#ffe9d6', '#ffe2c9', '#f9d9c0', '#fff0e1', '#f3d4bd'];

/** 髪色（落ち着いた可愛い系・派手すぎない） */
const HAIR_COLORS = [
  '#6b4f3a', '#3e3a39', '#8a6d4f', '#a98467', '#5b4a68',
  '#7d8a6a', '#b07b8c', '#6f8fa6', '#c9a227', '#9b7653',
  '#566573', '#b5651d'
];

/** 目（丸目・にこ目・たれ目＝全部ニュートラル） @type {((fg:string)=>string)[]} */
const EYES = [
  // 丸目
  (fg) => `<circle cx="24" cy="34" r="2.6" fill="${fg}"/><circle cx="40" cy="34" r="2.6" fill="${fg}"/>`,
  // にこ目（∪）
  (fg) =>
    `<path d="M20.5 34 q3.5 3.4 7 0" stroke="${fg}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    `<path d="M36.5 34 q3.5 3.4 7 0" stroke="${fg}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  // ゆる目（−に近い穏やかな弧）
  (fg) =>
    `<path d="M20.5 33.5 q3.5 1.6 7 0" stroke="${fg}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    `<path d="M36.5 33.5 q3.5 1.6 7 0" stroke="${fg}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
];

/** 口（にこ・ぽかん・むにっ） @type {((fg:string)=>string)[]} */
const MOUTHS = [
  (fg) => `<path d="M28 43 q4 3.6 8 0" stroke="${fg}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  (fg) => `<circle cx="32" cy="44" r="2.2" fill="none" stroke="${fg}" stroke-width="1.8"/>`,
  (fg) => `<path d="M28.5 44 q1.8 2 3.5 0 q1.7 2 3.5 0" stroke="${fg}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
];

/**
 * 髪型（前髪のかたち。全部ボブ系＝性別ニュートラル）
 * 顔円: cx32 cy34 r22。髪は上半分を覆う。
 * @type {((hair:string)=>string)[]}
 */
const HAIRS = [
  // ぱっつん前髪
  (hair) =>
    `<path d="M10 34 a22 22 0 0 1 44 0 l0 -4 q-4 2 -8 0 q-4 3 -8 0 q-4 3 -8 0 q-4 3 -8 0 q-4 2 -8 0 z" fill="${hair}"/>` +
    `<path d="M10 34 a22 22 0 0 1 44 0 l-3 -8 a19 19 0 0 0 -38 0 z" fill="${hair}"/>`,
  // ふんわり丸前髪（スカラップ）
  (hair) =>
    `<path d="M10 34 a22 22 0 0 1 44 0 q-3 -5 -7.3 -3 q-2.8 -5 -7.4 -3.4 q-2.3 -5 -7.3 -3.4 q-4.6 -1.6 -7.4 3.4 q-4.3 -2 -7.3 3 z" fill="${hair}"/>`,
  // センター分け
  (hair) =>
    `<path d="M10 34 a22 22 0 0 1 44 0 l-2 -6 q-8 4 -19 -8 q-3 8 -21 8 z" fill="${hair}"/>`,
  // ななめ前髪
  (hair) =>
    `<path d="M10 34 a22 22 0 0 1 44 0 l-1 -7 q-14 6 -24 -7 q-2 10 -18 9 z" fill="${hair}"/>`
];

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
  const bg = `hsl(${hue},50%,91%)`;
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hair = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
  const eyes = EYES[(h >>> 7) % EYES.length];
  const mouth = MOUTHS[(h >>> 10) % MOUTHS.length];
  const hairShape = HAIRS[(h >>> 12) % HAIRS.length];
  const blushOn = ((h >>> 20) & 1) === 1;
  const fg = '#5a4636'; // 目・口の色（柔らかいこげ茶）

  const blush = blushOn
    ? `<ellipse cx="21" cy="40.5" rx="3.4" ry="2" fill="#f5a8a0" opacity="0.55"/>` +
      `<ellipse cx="43" cy="40.5" rx="3.4" ry="2" fill="#f5a8a0" opacity="0.55"/>`
    : '';

  // 64x64 の座標系で描き、viewBox のサイズ仕様（n×n）は scale で互換維持。
  const k = n / 64;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<g transform="scale(${k})">` +
    `<circle cx="32" cy="34" r="22" fill="${skin}" stroke="#d9b89c" stroke-width="1.4"/>` +
    hairShape(hair) +
    eyes(fg) +
    blush +
    mouth(fg) +
    `</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
