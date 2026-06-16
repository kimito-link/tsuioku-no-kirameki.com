/**
 * longTaskTracker.js — メインスレッドを長時間ブロックした「Long Task」を有界に記録する純関数群。
 *
 * 背景(2026-06-17): 長時間配信(3h超/来場8000/ギフト多め)で Chrome「ページが応答しません」が出た。
 *   これは await pending(非同期 stall)でなく【メインスレッドの同期処理が数秒占有】された証拠。
 *   会議+実コード裏取りでも「長時間で育つデータの同期全走査」が原因の【形】までしか絞れず、
 *   静的読みでは数秒ブロックの発生源を1つに確定できなかった(会議の挙げた関数名はハルシネ)。
 *   そこで PerformanceObserver(type:'longtask')で実測し、最長タスクを fastDiag に出して
 *   次の発生時に真因を事実で特定する。本モジュールは観測値(duration/開始時刻/直近マーカー)を
 *   有界リングに畳むだけの純関数=テスト可能・副作用なし。配線(Observer 登録)は content-entry。
 */

/** longtask とみなす下限(ms)。PerformanceObserver の longtask は元々 50ms 以上だが、明示的に持つ。 */
export const LONGTASK_MIN_MS = 50;
/** リングに保持する「最長タスク」上限件数。 */
export const LONGTASK_TOP_MAX = 10;
/** 直近タスクのリングに保持する上限件数(時系列の傾向把握用)。 */
export const LONGTASK_RECENT_MAX = 20;

/**
 * @typedef {{
 *   durationMs: number,
 *   atMs: number,
 *   marker: string,
 *   attribution: string
 * }} LongTaskRecord
 *
 * @typedef {{
 *   top: LongTaskRecord[],
 *   recent: LongTaskRecord[],
 *   totalCount: number,
 *   maxMs: number
 * }} LongTaskState
 */

/** @returns {LongTaskState} 空の初期状態。 */
export function createLongTaskState() {
  return { top: [], recent: [], totalCount: 0, maxMs: 0 };
}

/**
 * Long Task を1件畳み込む純関数。state は破壊せず新しい state を返す。
 *
 * @param {LongTaskState|null|undefined} state
 * @param {{ durationMs?: unknown, atMs?: unknown, marker?: unknown, attribution?: unknown }} entry
 * @param {{ minMs?: number, topMax?: number, recentMax?: number }} [opts]
 * @returns {LongTaskState}
 */
export function recordLongTask(state, entry, opts = {}) {
  const base =
    state && typeof state === 'object' && Array.isArray(state.top) && Array.isArray(state.recent)
      ? state
      : createLongTaskState();
  const minMs = numOr(opts.minMs, LONGTASK_MIN_MS);
  const topMax = Math.max(1, Math.floor(numOr(opts.topMax, LONGTASK_TOP_MAX)));
  const recentMax = Math.max(1, Math.floor(numOr(opts.recentMax, LONGTASK_RECENT_MAX)));

  const durationMs = Math.round(numOr(entry?.durationMs, 0));
  if (!Number.isFinite(durationMs) || durationMs < minMs) return base;

  /** @type {LongTaskRecord} */
  const rec = {
    durationMs,
    atMs: Math.round(numOr(entry?.atMs, 0)),
    marker: clampStr(entry?.marker, 80),
    attribution: clampStr(entry?.attribution, 120)
  };

  // recent: 末尾追加して上限超過は古いものから落とす。
  const recent = base.recent.concat(rec);
  while (recent.length > recentMax) recent.shift();

  // top: duration 降順で上位 topMax 件だけ保持。
  const top = base.top
    .concat(rec)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, topMax);

  return {
    top,
    recent,
    totalCount: base.totalCount + 1,
    maxMs: Math.max(base.maxMs, durationMs)
  };
}

/**
 * fastDiag へ出す軽量サマリ。巨大化させないため top/recent は件数を抑えた要点だけにする。
 * @param {LongTaskState|null|undefined} state
 * @returns {{ totalCount: number, maxMs: number, top: LongTaskRecord[], recent: LongTaskRecord[] }}
 */
export function summarizeLongTasks(state) {
  const base =
    state && typeof state === 'object' && Array.isArray(state.top) && Array.isArray(state.recent)
      ? state
      : createLongTaskState();
  return {
    totalCount: base.totalCount,
    maxMs: base.maxMs,
    top: base.top.slice(0, 5),
    recent: base.recent.slice(-8)
  };
}

/** @param {unknown} v @param {number} dflt */
function numOr(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

/** @param {unknown} v @param {number} max */
function clampStr(v, max) {
  const s = String(v ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}
