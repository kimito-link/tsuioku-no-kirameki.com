/**
 * venueCrowdMotion.js
 *
 * 会場の観客シルエット群を「生きている会場」にするための動きパラメータ(純関数)。
 * crowdRasterizer の drawCrowdOnCanvas が受け取って、各観客のペンライト角度・体の上下を
 * 時間で揺らす。canvas には依存しない=テスト可能。
 *
 * 設計の根拠(2026-06-15 会議+世界事例リサーチ・reference_venue_copresence_meeting_2026-06-15):
 *   - 査読研究(VR concert CIT, arxiv 2503.13121)=チャット量に応じて観客を「同期して」動かすと
 *     co-presence が統計的有意に向上(p<.05)。鍵は movement synchrony(同期した動き)。
 *   - idle 設計=完全静止は「凍った彫像」に見える。微呼吸で「生きている空間」になる。
 *   - 静かな時(heat~0)=ゆっくり小さく全員が同じ位相で呼吸(=一緒に静かに見ている)。
 *     盛り上がり(heat~1)=速く大きくペンライトが同期して波打つ(=一緒に沸いている)。
 *
 * 「同期」を出すため、全観客が共通の位相(globalPhase)を使う。個体差(perPhase)は
 * 完全一致だと機械的なので、ごく僅かだけ(同期を壊さない範囲で)ずらす。
 */

/** 1サイクルの基準ミリ秒。静かな時はこの周期で、盛り上がるほど速くなる。 */
const BASE_PERIOD_MS = 3600;

/**
 * 0..1 にクランプ。
 * @param {number} v
 * @returns {number}
 */
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * 会場全体の動きの「設計値」を heat(0..1) から決める。
 * 静か=ゆっくり・小さく・ほぼ完全同期。盛り上がり=速く・大きく・少しバラけて波打つ。
 *
 * @param {number} heatLevel 盛り上がり 0(静か)..1(怒涛)。venueHeat.resolveVenueHeatLevel の値。
 * @returns {{
 *   periodMs: number,    // 1サイクルのミリ秒(速さ。小さいほど速い)
 *   swayDeg: number,     // ペンライトの最大振れ角(度)
 *   breathePx: number,   // 体の上下呼吸の振幅(px・size=1 基準の相対値)
 *   desync: number       // 個体ごとの位相ズレ量 0..1(0=完全同期, 大=バラける)
 * }}
 */
export function resolveCrowdMotionProfile(heatLevel) {
  const h = clamp01(heatLevel);
  // 速さ: 静か 3600ms → 怒涛 1200ms(約3倍速)。
  const periodMs = BASE_PERIOD_MS - h * 2400;
  // 振れ角: 静か 4°(ほぼ揺れない呼吸) → 怒涛 22°(しっかり振る)。
  const swayDeg = 4 + h * 18;
  // 呼吸の上下: 常に微かに(静止を避ける)・盛り上がりで少し増える。
  const breathePx = 0.018 + h * 0.022;
  // 同期度: 静かは完全同期(全員そろって静かに)・盛り上がると少しだけバラけて波打つ感。
  const desync = h * 0.28;
  return { periodMs, swayDeg, breathePx, desync };
}

/**
 * ある観客 1 体の、ある時刻における動きを計算する。
 * globalPhase を全員で共有することで「同期した波」になる(co-presence の核)。
 *
 * @param {number} timeMs 経過時間(performance.now 等。単調増加なら何でも可)
 * @param {number} unitPhase その観客固有の位相シード 0..1(座標やindex由来。安定していること)
 * @param {{ periodMs:number, swayDeg:number, breathePx:number, desync:number }} profile resolveCrowdMotionProfile の戻り値
 * @returns {{ swayRad:number, breathe:number }} swayRad=ペンライト傾き(ラジアン)/ breathe=体の上下(相対px係数, 上が負)
 */
export function resolveCrowdSpriteMotion(timeMs, unitPhase, profile) {
  const t = Number(timeMs) || 0;
  const period = Math.max(200, profile.periodMs || BASE_PERIOD_MS);
  const u = clamp01(unitPhase);
  // 全員共通の位相(同期の源泉)。
  const globalPhase = (t / period) * Math.PI * 2;
  // 個体差: desync ぶんだけ位相をずらす(0 なら完全同期)。
  const phase = globalPhase + u * Math.PI * 2 * profile.desync;
  const swayRad = Math.sin(phase) * (((profile.swayDeg || 0) * Math.PI) / 180);
  // 呼吸は揺れと別周期(ゆっくり)・上方向(負)に膨らむ。全員ほぼ同期。
  const breathePhase = (t / (period * 1.7)) * Math.PI * 2 + u * Math.PI * 0.5 * profile.desync;
  const breathe = -(Math.sin(breathePhase) * 0.5 + 0.5) * (profile.breathePx || 0);
  return { swayRad, breathe };
}
