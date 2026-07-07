// @ts-nocheck — スカラー4個の鏡(純データ)。実行時 DOM/chrome 非依存。
/**
 * 室温(ルーム熱度・5分増減)の「鏡」スナップショット純関数
 *   (reference_full_mirror_SYNTHESIS.md M3・第4号)。
 *
 * 狙い = ①拡張の「室温」パネル(直近5分の応援増加・件数/人数/熱度%/文言)を純Web③に丸写しする。
 *   ①は popup-entry:12942 `renderRoomHeatSummary(total, active, heatPercent, heatText)` で
 *   スカラー4個を textContent/style.width に入れるだけ(純lib不要・命令的だが数値4個)。
 *   ③も同じ4値を鏡で受け取り、同じ描画をする。約100バイト=最軽量パネル。
 *
 * ★HTML文字列を載せない(R-1)。数値4個+文言1個のみ=JSON-safe・prune 不要(コンパクト)。
 *
 * @typedef {{
 *   liveId: string, capturedAt: number,
 *   total: number, active: number, heatPercent: number, heatText: string
 * }} RoomHeatMirrorSnapshot
 *
 * @module roomHeatMirror
 */

function s(v) {
  return String(v == null ? '' : v).trim();
}
function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
/** 0〜100 に丸めた百分率(熱度バー幅)。 */
function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * ①が計算済みの室温4値 → 鏡スナップショット。
 * @param {{ total?: unknown, active?: unknown, heatPercent?: unknown, heatText?: unknown }} input
 * @param {{ liveId?: string, nowMs?: number }} [opts]
 * @returns {RoomHeatMirrorSnapshot|null} liveId が無い/全ゼロで文言も空なら null(空パネルにしない)
 */
export function buildRoomHeatMirrorSnapshot(input, opts = {}) {
  const i = input && typeof input === 'object' ? input : null;
  if (!i) return null;
  const liveId = s(opts.liveId).toLowerCase();
  const capturedAt = Number(opts.nowMs) || 0;
  const total = nonNegInt(i.total);
  const active = nonNegInt(i.active);
  const heatPercent = clampPercent(i.heatPercent);
  const heatText = s(i.heatText);
  // 何も無い(全ゼロ+文言空)なら鏡にしない=③は「室温」を出さない。
  if (!total && !active && heatPercent === 0 && !heatText) return null;
  return { liveId, capturedAt, total, active, heatPercent, heatText };
}

/**
 * 鏡スナップショットを null-safe に復元(③paint が使う前のガード)。
 * @param {Partial<RoomHeatMirrorSnapshot>|null|undefined} snap
 * @returns {RoomHeatMirrorSnapshot|null}
 */
export function restoreRoomHeatMirror(snap) {
  const c = snap && typeof snap === 'object' ? snap : null;
  if (!c) return null;
  const total = nonNegInt(c.total);
  const active = nonNegInt(c.active);
  const heatPercent = clampPercent(c.heatPercent);
  const heatText = s(c.heatText);
  if (!total && !active && heatPercent === 0 && !heatText) return null;
  return {
    liveId: s(c.liveId),
    capturedAt: Number(c.capturedAt) || 0,
    total,
    active,
    heatPercent,
    heatText
  };
}
