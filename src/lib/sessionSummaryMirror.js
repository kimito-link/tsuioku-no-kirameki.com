// @ts-nocheck — 任意のサマリ行配列を JSON-safe 鏡へ間引く動的整形
/**
 * セッション比較(記録サマリの推移)の「鏡」スナップショット純関数
 *   (reference_full_mirror_SYNTHESIS.md M5・第5号)。
 *
 * 狙い = ①拡張の「記録サマリの推移(この放送)」パネル(約1分ごとのサンプル最大24行)を純Web③に丸写しする。
 *   ①は renderSessionSummaryComparePanel(popup-entry.js)で IndexedDB から rows を読み、純lib
 *   buildSessionSummaryCompareTableHtml(rows) でテーブルHTML化する。IndexedDB は popup しか読めないため、
 *   ③は paint に使った rows を鏡で受け取り、同じ純lib を呼ぶ(第2号 giftHistory と同じパターン)。
 *
 * ★制約(R-1): HTML文字列は鏡に載せない。rows(数値のみの JSON-safe 配列)を運び、③が
 *   buildSessionSummaryCompareTableHtml を自分で呼ぶ(escape/整形は lib 内で済む=③でも安全)。
 * ★row 形状は buildSessionSummaryCompareTableHtml が食う形と一致させる(sessionSummaryCompareTableHtml.js:17):
 *   { capturedAt, commentStorageCount, uniqueKnownCommenters, giftUserCount,
 *     peakConcurrentEstimate(null可), officialCommentCount(null可) }
 *
 * @typedef {{ capturedAt: number, commentStorageCount: number, uniqueKnownCommenters: number,
 *   giftUserCount: number, peakConcurrentEstimate: number|null, officialCommentCount: number|null }} SessionSummaryRow
 * @typedef {{ liveId: string, capturedAt: number, rows: SessionSummaryRow[] }} SessionSummaryMirrorSnapshot
 *
 * @module sessionSummaryMirror
 */

/** 鏡に載せる上限(①の renderSessionSummaryComparePanel の 24 と揃える)。 */
export const SESSION_SUMMARY_MIRROR_ROWS_CAP = 24;

function s(v) {
  return String(v == null ? '' : v).trim();
}
function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
/** null 許容の整数(peakConcurrentEstimate/officialCommentCount は「取れない」を null で表す)。 */
function nullableInt(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/** 1行 → 鏡行(必要フィールドだけ verbatim・JSON-safe)。 */
function toRow(r) {
  const it = r && typeof r === 'object' ? r : {};
  return {
    capturedAt: nonNegInt(it.capturedAt),
    commentStorageCount: nonNegInt(it.commentStorageCount),
    uniqueKnownCommenters: nonNegInt(it.uniqueKnownCommenters),
    giftUserCount: nonNegInt(it.giftUserCount),
    peakConcurrentEstimate: nullableInt(it.peakConcurrentEstimate),
    officialCommentCount: nullableInt(it.officialCommentCount)
  };
}

/**
 * サマリ推移 rows → 鏡スナップショット。
 * @param {unknown[]} rows ①が IDB から読んだサマリ行(古→新 or 新→古はそのまま保持=①の並びに従う)
 * @param {{ liveId?: string, nowMs?: number, cap?: number }} [opts]
 * @returns {SessionSummaryMirrorSnapshot|null} rows が空なら null(空パネルにしない)
 */
export function buildSessionSummaryMirrorSnapshot(rows, opts = {}) {
  const src = Array.isArray(rows) ? rows : [];
  const cap = Math.max(1, Math.floor(Number(opts.cap) || SESSION_SUMMARY_MIRROR_ROWS_CAP));
  const liveId = s(opts.liveId).toLowerCase();
  const capturedAt = Number(opts.nowMs) || 0;
  const out = src.slice(0, cap).map(toRow);
  if (!out.length) return null;
  return { liveId, capturedAt, rows: out };
}

/**
 * 鏡スナップショットを null-safe に復元(③paint が使う前のガード)。
 * @param {Partial<SessionSummaryMirrorSnapshot>|null|undefined} snap
 * @returns {SessionSummaryMirrorSnapshot|null}
 */
export function restoreSessionSummaryMirror(snap) {
  const c = snap && typeof snap === 'object' ? snap : null;
  if (!c) return null;
  const rows = (Array.isArray(c.rows) ? c.rows : []).map(toRow);
  if (!rows.length) return null;
  return { liveId: s(c.liveId), capturedAt: Number(c.capturedAt) || 0, rows };
}
