// venueHeat.js
// v0.1.732: 会場モードの「熱量の色温度」純関数。
//
// 設計正本: 星野アイデア会議2(.artifacts/venue-meeting2・2026-06-14)の
//   「熱量の色温度=コメント速度→暖色」。会場の盛り上がり(コメントの速さ)を
//   照明の色温度で表す。過疎=涼しい青みがかった照明、怒涛=暖かいオレンジの照明。
//   SHOWROOM/本家にない追憶独自の「場の温度が見える」体験。
//
// このファイルは数値/色モデルだけ(DOM/storage/chrome.* 非依存・テスト可能):
//   - 直近コメントの capturedAt から「窓内コメント数」を数える
//   - コメント速度(件/分 相当)を 0..1 の heat level に正規化(log で怒涛を青天井にしない)
//   - heat level → 暖色 CSS 色(涼→暖)に写す
// venueBar 側は heat level / 色を CSS 変数(--nlsb-heat 等)に注入するだけ。

/** 熱量を測る時間窓(ミリ秒)。直近この時間に来たコメントの密度で速さを見る。 */
export const VENUE_HEAT_WINDOW_MS = 20_000;

/**
 * heat level=1.0(満熱)に達するコメント速度(件/分)。これ以上は頭打ち。
 * 怒涛の実況(毎秒1件=60件/分)で十分熱い、という目安。
 */
export const VENUE_HEAT_FULL_PER_MIN = 60;

/**
 * 直近コメント行(capturedAt 付き)から会場の「熱量レベル」0..1 を算出する純関数。
 *
 * @param {ReadonlyArray<{ capturedAt?: number|null }>} rows 正規化済みコメント行
 * @param {{ now?: number, windowMs?: number, fullPerMin?: number }} [opts]
 *   now=基準時刻(既定 Date.now()・テストで固定可) / windowMs=計測窓 / fullPerMin=満熱の件/分
 * @returns {number} 0(過疎・涼)..1(怒涛・暖)の熱量レベル
 */
export function resolveVenueHeatLevel(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  const windowMs =
    Number.isFinite(opts.windowMs) && opts.windowMs > 0 ? Number(opts.windowMs) : VENUE_HEAT_WINDOW_MS;
  const fullPerMin =
    Number.isFinite(opts.fullPerMin) && opts.fullPerMin > 0
      ? Number(opts.fullPerMin)
      : VENUE_HEAT_FULL_PER_MIN;

  const since = now - windowMs;
  let countInWindow = 0;
  for (const r of list) {
    const at = Number(r?.capturedAt);
    if (!Number.isFinite(at)) continue;
    // 未来の時刻(時計ずれ)は now にクランプして数える(窓には入れる)。
    const t = at > now ? now : at;
    if (t >= since) countInWindow += 1;
  }
  if (countInWindow <= 0) return 0;

  // 窓内件数を「件/分」へ換算(窓が20秒なら ×3)。
  const perMin = countInWindow * (60_000 / windowMs);
  // log 正規化で怒涛を青天井にしない(満熱 fullPerMin で 1.0)。
  const level = Math.log1p(perMin) / Math.log1p(fullPerMin);
  return Math.max(0, Math.min(1, level));
}

/**
 * 熱量レベル 0..1 を会場照明の暖色(CSS rgb 文字列)に写す純関数。
 * 涼(level=0)= 青みがかった落ち着いた照明 / 暖(level=1)= 熱いオレンジの照明。
 * 中間は線形補間。CSS の ambient ライト色(放射状グラデ等)に使う。
 *
 * @param {number} level 0..1
 * @returns {string} `rgb(r, g, b)`
 */
export function heatLevelToWarmColor(level) {
  const t = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  // 涼: 落ち着いた青紫(70, 90, 140) → 暖: 熱いオレンジ(255, 150, 60)
  const cool = [70, 90, 140];
  const warm = [255, 150, 60];
  /** @param {number} a @param {number} b */
  const mix = (a, b) => Math.round(a + (b - a) * t);
  const r = mix(cool[0], warm[0]);
  const g = mix(cool[1], warm[1]);
  const b = mix(cool[2], warm[2]);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 熱量レベルから照明の不透明度(=熱いほど色が濃く差す)を返す純関数。
 * 過疎時はほぼ透明(映像を邪魔しない)、怒涛時に色がしっかり乗る。
 *
 * @param {number} level 0..1
 * @param {{ min?: number, max?: number }} [opts] min=過疎時の不透明度 / max=満熱時
 * @returns {number} 0..1 の不透明度
 */
export function heatLevelToGlowOpacity(level, opts = {}) {
  const t = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const min = Number.isFinite(opts.min) ? Math.max(0, Math.min(1, opts.min)) : 0.06;
  const max = Number.isFinite(opts.max) ? Math.max(0, Math.min(1, opts.max)) : 0.34;
  return min + (max - min) * t;
}

/**
 * 熱量レベルを「ことば」のラベルにする純関数(任意・aria/ツールチップ用)。
 *
 * @param {number} level 0..1
 * @returns {'静か'|'おだやか'|'盛り上がり'|'大盛況'}
 */
export function heatLevelToLabel(level) {
  const t = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  if (t < 0.15) return '静か';
  if (t < 0.45) return 'おだやか';
  if (t < 0.75) return '盛り上がり';
  return '大盛況';
}
