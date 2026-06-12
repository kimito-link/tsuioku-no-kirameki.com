/**
 * 匿名 userId 向けの決定論的アバター（SVG data URL）。
 * ニコ公式では同一シルエットになり得るため、拡張内でユーザーを区別しやすくする用途。
 *
 * v0.1.700: 5×5 幾何学模様（「AIっぽくて怖い」とユーザー指摘）→ 顔アバターに変更。
 * v0.1.701: タッチを本家ゆっくり3キャラ（りんく/こんた/たぬ姉・kimito-link リポの
 *   yukkuri-charactore-english）に寄せた。特徴 = 太い黒アウトライン・大きな目
 *   （虹彩+白ハイライト）・ギザギザ前髪・くっきりチーク・鮮やかな髪色。
 *   肌4×髪色12×前髪4×目3×口3×頬2 ≈ 3,456通りを userId ハッシュから決定論導出
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

/** 線色（本家のアウトライン＝ほぼ黒のこげ茶） */
const LINE = '#2b2320';

/** 肌色（本家準拠の明るい肌・性別ニュートラル） */
const SKIN_TONES = ['#ffeede', '#ffe6cf', '#fdf0e4', '#f8dfc8'];

/** 髪色（本家こんた=オレンジ/りんく=黒 系の鮮やかパレット） */
const HAIR_COLORS = [
  '#f29b38', '#332f2e', '#8a5a2b', '#e88bb1', '#5b87c5', '#7aa45a',
  '#e9c25a', '#d4543a', '#8d6bb0', '#8f8f8f', '#4ba596', '#a4683f'
];

/**
 * 目（本家3キャラの表情差分そのまま: ぱっちり/にこにこ/ジト目）。
 * 顔円: cx32 cy35 r23。目の中心は (23,36) (41,36)。
 * @type {((iris:string)=>string)[]}
 */
const EYES = [
  // ぱっちり目（白目+虹彩+大ハイライト・こんた normal 系）
  (iris) =>
    `<ellipse cx="23" cy="36" rx="5.4" ry="6" fill="#fff" stroke="${LINE}" stroke-width="2"/>` +
    `<ellipse cx="41" cy="36" rx="5.4" ry="6" fill="#fff" stroke="${LINE}" stroke-width="2"/>` +
    `<circle cx="23" cy="37" r="3.1" fill="${iris}"/><circle cx="41" cy="37" r="3.1" fill="${iris}"/>` +
    `<circle cx="21.8" cy="35.2" r="1.5" fill="#fff"/><circle cx="39.8" cy="35.2" r="1.5" fill="#fff"/>`,
  // にこにこ閉じ目（∩・りんく smile 系・太線）
  () =>
    `<path d="M18 37.5 q5 -6 10 0" stroke="${LINE}" stroke-width="2.8" fill="none" stroke-linecap="round"/>` +
    `<path d="M36 37.5 q5 -6 10 0" stroke="${LINE}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
  // ジト目/half-eyes（まぶた線+下に小さな虹彩・たぬ姉 half 系）
  (iris) =>
    `<path d="M18 34.5 q5 1.2 10 0" stroke="${LINE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M36 34.5 q5 1.2 10 0" stroke="${LINE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M19.5 35 a3.5 3.2 0 0 0 7 0 z" fill="${iris}"/>` +
    `<path d="M37.5 35 a3.5 3.2 0 0 0 7 0 z" fill="${iris}"/>`
];

/** 口（ω口/あーん口/にっこり線・本家の mouth-open/closed 差分） @type {(()=>string)[]} */
const MOUTHS = [
  () =>
    `<path d="M27.5 46 q2.3 2.6 4.5 0 q2.2 2.6 4.5 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  () =>
    `<path d="M27 45.5 a5 4.4 0 0 0 10 0 z" fill="#9e3a30" stroke="${LINE}" stroke-width="1.8"/>` +
    `<path d="M29.5 48.6 a2.6 1.7 0 0 1 5 0 z" fill="#e9756a"/>`,
  () =>
    `<path d="M27 45.5 q5 4.2 10 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
];

/**
 * 前髪（本家のギザギザ毛先。全部ボブ系＝性別ニュートラル・太アウトライン込み）。
 * 顔円: cx32 cy35 r23（上端 y=12）。
 * @type {((hair:string)=>string)[]}
 */
const HAIRS = [
  // ぱっつんギザ（りんく系）
  (hair) =>
    `<path d="M9 36 a23 23 0 0 1 46 0 l-4 -6 -3 5 -4 -7 -4 6 -4 -8 -4 8 -4 -6 -4 7 -3 -5 z" ` +
    `fill="${hair}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,
  // センター分けギザ（たぬ姉系）
  (hair) =>
    `<path d="M9 36 a23 23 0 0 1 46 0 l-3 -8 -4 5 -3 -7 -3 4 -2 -12 -2 12 -3 -4 -3 7 -4 -5 -4 8 z" ` +
    `fill="${hair}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,
  // ななめ流しギザ（こんた系）
  (hair) =>
    `<path d="M9 36 a23 23 0 0 1 46 0 l-2 -9 -5 4 -3 -8 -5 5 -6 -9 -3 9 -5 -4 -5 7 -4 -3 z" ` +
    `fill="${hair}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,
  // ふんわり丸め+ちょいギザ
  (hair) =>
    `<path d="M9 36 a23 23 0 0 1 46 0 l-3 -5 -4 3 -3 -6 -5 3 -3 -5 -3 5 -5 -3 -3 6 -4 -3 -3 5 z" ` +
    `fill="${hair}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`
];

/**
 * @param {string} hex 髪色
 * @returns {string} 虹彩用に暗くした色
 */
function darken(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#5a4636';
  const f = (x) => Math.max(0, Math.floor(parseInt(x, 16) * 0.55));
  return `rgb(${f(m[1])},${f(m[2])},${f(m[3])})`;
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
  const hair = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
  const iris = darken(hair);
  const eyes = EYES[(h >>> 7) % EYES.length];
  const mouth = MOUTHS[(h >>> 10) % MOUTHS.length];
  const hairShape = HAIRS[(h >>> 12) % HAIRS.length];
  const blushOn = ((h >>> 20) & 1) === 1;

  // 本家準拠のくっきりチーク（blushOn でない人も薄め常時＝ゆっくり顔の特徴）
  const blush =
    `<ellipse cx="17.5" cy="42" rx="4.6" ry="2.6" fill="#ff9d9d" opacity="${blushOn ? 0.75 : 0.4}"/>` +
    `<ellipse cx="46.5" cy="42" rx="4.6" ry="2.6" fill="#ff9d9d" opacity="${blushOn ? 0.75 : 0.4}"/>`;

  // 64x64 の座標系で描き、viewBox のサイズ仕様（n×n）は scale で互換維持。
  const k = n / 64;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<g transform="scale(${k})">` +
    `<circle cx="32" cy="35" r="23" fill="${skin}" stroke="${LINE}" stroke-width="2.4"/>` +
    hairShape(hair) +
    blush +
    eyes(iris) +
    mouth() +
    `</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
