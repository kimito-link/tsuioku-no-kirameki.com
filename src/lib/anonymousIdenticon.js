/**
 * 匿名 userId 向けの決定論的アバター（SVG data URL）。
 * ニコ公式では同一シルエットになり得るため、拡張内でユーザーを区別しやすくする用途。
 *
 * v0.1.700: 幾何学模様 → 顔アバターへ。
 * v0.1.701-702: タッチを本家ゆっくり3キャラ（kimito-link/yukkuri-charactore-english）へ接近。
 *   v0.1.702 の核心 = **髪を顔円の内側でなく「頭の外側シルエット」として描く**（本家は
 *   髪が輪郭の外まで膨らみ、はね毛が飛ぶ）。+ 天使の輪（髪ハイライト帯）・縦長の大きな目
 *   （虹彩2色+複数ハイライト）・アホ毛/けもの耳のアクセント。
 *   肌4×髪色12×髪型4×目3×口3×アクセント3 ≈ 5,184通りを userId ハッシュから決定論導出。
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

const LINE = '#332a26';

const SKIN_TONES = ['#ffeede', '#ffe6cf', '#fdf0e4', '#f8dfc8'];

/** [ベース, ハイライト帯] のペア */
const HAIR_COLORS = [
  ['#f29b38', '#ffc97e'], ['#3a3534', '#6b6360'], ['#8a5a2b', '#c08c50'],
  ['#e88bb1', '#ffc3da'], ['#5b87c5', '#9cc0ea'], ['#7aa45a', '#b4d59a'],
  ['#e9c25a', '#ffe6a0'], ['#d4543a', '#f59679'], ['#8d6bb0', '#c4a8e0'],
  ['#8f8f8f', '#c9c9c9'], ['#4ba596', '#92d5c9'], ['#a4683f', '#d49a6e']
];

/**
 * 目（縦長の大きな目・本家準拠）。中心 (23.5,37) (40.5,37)。
 * @type {((iris:string, irisDark:string)=>string)[]}
 */
const EYES = [
  // ぱっちり（白目+2色虹彩+ハイライト2つ）
  (iris, irisDark) =>
    `<ellipse cx="23.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/>` +
    `<ellipse cx="40.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/>` +
    `<ellipse cx="23.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/>` +
    `<ellipse cx="40.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/>` +
    `<ellipse cx="23.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/>` +
    `<ellipse cx="40.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/>` +
    `<circle cx="22" cy="35.4" r="1.6" fill="#fff"/><circle cx="39" cy="35.4" r="1.6" fill="#fff"/>` +
    `<circle cx="25.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/><circle cx="42.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/>`,
  // にこにこ閉じ目（∩・太線）
  () =>
    `<path d="M18.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<path d="M35.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  // ジト目（まぶた直線+下半分の虹彩）
  (iris, irisDark) =>
    `<path d="M18.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/>` +
    `<path d="M35.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/>` +
    `<path d="M20.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/>` +
    `<path d="M37.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/>` +
    `<path d="M22 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/>` +
    `<path d="M39 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/>`
];

/** 口 @type {(()=>string)[]} */
const MOUTHS = [
  () =>
    `<path d="M27.5 46.5 q2.3 2.6 4.5 0 q2.2 2.6 4.5 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  () =>
    `<path d="M27 46 a5 4.6 0 0 0 10 0 z" fill="#9e3a30" stroke="${LINE}" stroke-width="1.8"/>` +
    `<path d="M29.5 49.2 a2.6 1.8 0 0 1 5 0 z" fill="#e9756a"/>`,
  () =>
    `<path d="M27 46 q5 4.4 10 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
];

/**
 * 髪 = 頭の外側シルエット（顔より大きく描く・本家の頭身）。前髪のギザは内側に切り込む。
 * @type {((c:string, hi:string)=>string)[]}
 */
const HAIRS = [
  // ボブ+ぱっつんギザ（りんく系）
  (c, hi) =>
    `<path d="M8 44 q-2 -26 24 -28 q26 2 24 28 l-5 3 q3 -8 1 -14 l-3 6 -3 -8 -4 6 -4 -8 -3 7 -4 -7 -4 8 -4 -6 -3 8 -3 -6 q-2 6 1 14 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M14 24 q8 -7 18 -7 q10 0 18 7 q-8 -3 -18 -3 q-10 0 -18 3 z" fill="${hi}" opacity="0.85"/>`,
  // 外はねショート（こんた系）
  (c, hi) =>
    `<path d="M9 42 q-7 -4 -3 -10 q-6 -2 0 -8 q2 -12 26 -12 q24 0 26 12 q6 6 0 8 q4 6 -3 10 l-4 1 q2 -6 0 -10 l-4 5 -3 -9 -5 6 -5 -9 -4 8 -5 -7 -4 9 -4 -5 q-2 4 0 10 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M15 22 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
  // ロング風（たぬ姉系・髪が顔の横を流れ落ちる）
  (c, hi) =>
    `<path d="M10 58 q-4 -18 -2 -30 q4 -14 24 -14 q20 0 24 14 q2 12 -2 30 l-6 -2 q3 -12 2 -22 l-4 6 -3 -9 -5 6 -4 -9 -4 8 -5 -7 -4 8 -4 -5 q-1 10 2 22 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M15 23 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
  // ふんわりマッシュ
  (c, hi) =>
    `<path d="M8 40 q-2 -25 24 -25 q26 0 24 25 q-1 5 -5 6 q2 -5 1 -9 l-4 5 -3 -7 -5 5 -4 -7 -4 6 -4 -6 -4 7 -5 -5 -3 7 -4 -5 q-1 4 1 9 q-4 -1 -5 -6 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M14 24 q9 -6.5 18 -6.5 q9 0 18 6.5 q-9 -3 -18 -3 q-9 0 -18 3 z" fill="${hi}" opacity="0.85"/>`
];

/**
 * アクセント（本家のシルエット要素: アホ毛/けもの耳/なし）。最背面に描く。
 * @type {((c:string)=>string)[]}
 */
const ACCENTS = [
  (c) => `<path d="M32 16 q-2 -8 4 -11 q-1 5 1 7 q3 -3 7 -2 q-5 2 -6 7 z" fill="${c}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,
  (c) =>
    `<path d="M13 26 q-3 -12 3 -16 q6 3 7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M51 26 q3 -12 -3 -16 q-6 3 -7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M15.5 24 q-1.5 -7 1.5 -10 q3 2 4 8 z" fill="#fff" opacity="0.75"/>` +
    `<path d="M48.5 24 q1.5 -7 -1.5 -10 q-3 2 -4 8 z" fill="#fff" opacity="0.75"/>`,
  () => ''
];

/**
 * @param {string} hex
 * @param {number} f 乗数
 * @returns {string}
 */
function shade(hex, f) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#5a4636';
  const c = (/** @type {string} */ x) =>
    Math.max(0, Math.min(255, Math.floor(parseInt(x, 16) * f)));
  return `rgb(${c(m[1])},${c(m[2])},${c(m[3])})`;
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
  const bg = `hsl(${hue},55%,90%)`;
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const [hairC, hairHi] = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
  const iris = shade(hairC, 0.9);
  const irisDark = shade(hairC, 0.45);
  const eyes = EYES[(h >>> 7) % EYES.length];
  const mouth = MOUTHS[(h >>> 10) % MOUTHS.length];
  const hairShape = HAIRS[(h >>> 12) % HAIRS.length];
  const accent = ACCENTS[(h >>> 21) % ACCENTS.length];
  const blushStrong = ((h >>> 20) & 1) === 1;

  const blush =
    `<ellipse cx="17" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/>` +
    `<ellipse cx="47" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/>`;

  // 64x64 の座標系で描き、viewBox のサイズ仕様（n×n）は scale で互換維持。
  // 描画順: アクセント(最背面) → 顔 → 髪(頭シルエット・前髪ギザが肌の上に出る) → 表情。
  const k = n / 64;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<g transform="scale(${k})">` +
    accent(hairC) +
    `<path d="M13 38 a19 19 0 1 0 38 0 a19 21 0 0 0 -38 0 z" fill="${skin}" stroke="${LINE}" stroke-width="2.2"/>` +
    hairShape(hairC, hairHi) +
    blush +
    eyes(iris, irisDark) +
    mouth() +
    `</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
