import { toEpochMs } from './timeAuthority.js';
import { tierForGiftDeltaPoints } from './giftDeltaFallback.js';

/** この間隔を超えた2実測は差分を出さない(15分)。 */
export const PULSE_MAX_GAP_MS = 15 * 60_000;

/** @typedef {import('./liveRankingView.js').SupporterRow} SupporterRow */
/** @typedef {{ delta: number, tier: 'small'|'medium'|'large'|'mega' }} RowPulse */
/**
 * @typedef {{ byKey: Map<string, RowPulse>, sum: number, spanMs: number,
 *   top: { row: SupporterRow, delta: number }|null, tier: RowPulse['tier']|null }} PulseResult
 */

/** @type {PulseResult} 何も無い(初回・再送・古すぎ・増分なし)。 */
export const EMPTY_PULSE = Object.freeze({ byKey: new Map(), sum: 0, spanMs: 0, top: null, tier: null });

/**
 * 行の同一性キー。数値 uid がある行だけ追跡する。
 * 匿名行は同名の別人をつなぐおそれがあるため、差分を出さない。
 * @param {SupporterRow|null|undefined} row
 * @returns {string} '' なら追跡しない
 */
export function pulseRowKey(row) {
  const uid = String((row && row.uid) || '').trim();
  return uid ? `u:${uid}` : '';
}

/** @param {SupporterRow[]} rows @returns {Map<string, number>} key → point */
function pointsByKey(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const k = pulseRowKey(r);
    if (k) m.set(k, Math.max(0, Number(r.point) || 0));
  }
  return m;
}

/**
 * 前回の点から今回の正の差分だけを返す。減少・同値・前回にいなかった行は載せない。
 * @param {Map<string, number>} prevPoints
 * @param {SupporterRow[]} rows
 * @param {number} spanMs
 * @returns {PulseResult}
 */
export function diffGiftRows(prevPoints, rows, spanMs) {
  const byKey = new Map();
  let sum = 0;
  /** @type {{ row: SupporterRow, delta: number }|null} */
  let top = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    const k = pulseRowKey(r);
    if (!k || !prevPoints.has(k)) continue;
    const d = (Number(r.point) || 0) - /** @type {number} */ (prevPoints.get(k));
    if (!(d > 0)) continue;
    byKey.set(k, { delta: d, tier: tierForGiftDeltaPoints(d) });
    sum += d;
    if (!top || d > top.delta) top = { row: r, delta: d };
  }
  if (!top) return EMPTY_PULSE;
  return { byKey, sum, spanMs, top, tier: tierForGiftDeltaPoints(top.delta) };
}

/**
 * 配信ごとの標本と差分を保持する器。同じ capturedAt の再送は前回結果をそのまま返す。
 */
export function createGiftPulseRegistry() {
  /** @type {Map<string, { at: number, points: Map<string, number>, result: PulseResult }>} */
  const lives = new Map();
  /** @type {Set<string>|null} */ let touched = null;
  return {
    begin() { touched = new Set(); },
    /**
     * @param {unknown} liveId
     * @param {SupporterRow[]} rows
     * @param {unknown} capturedAt
     * @returns {PulseResult}
     */
    pulseFor(liveId, rows, capturedAt) {
      const id = String(liveId || '');
      if (touched) touched.add(id);
      const at = toEpochMs(capturedAt);
      const cur = lives.get(id);
      if (!at) return cur ? cur.result : EMPTY_PULSE;
      if (cur && at <= cur.at) return cur.result;
      const points = pointsByKey(rows);
      let result = EMPTY_PULSE;
      if (cur) {
        const span = at - cur.at;
        result = span <= PULSE_MAX_GAP_MS ? diffGiftRows(cur.points, rows, span) : EMPTY_PULSE;
      }
      lives.set(id, { at, points, result });
      return result;
    },
    end() {
      if (touched) for (const k of Array.from(lives.keys())) if (!touched.has(k)) lives.delete(k);
      touched = null;
    },
    size() { return lives.size; }
  };
}

/** 「+1,200pt」。0以下は空文字。 @param {unknown} d */
export function formatPtDelta(d) {
  const n = Math.floor(Number(d) || 0);
  return n > 0 ? `+${n.toLocaleString('ja-JP')}pt` : '';
}

/** 実測間隔の文言。 @param {unknown} spanMs */
export function spanText(spanMs) {
  const s = Math.round((Number(spanMs) || 0) / 1000);
  if (s <= 0) return '';
  return s < 120 ? `直近 ${s} 秒` : `直近 ${Math.round(s / 60)} 分`;
}
