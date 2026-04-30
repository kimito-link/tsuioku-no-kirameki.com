/**
 * L13: 冒頭 5 分の予兆 → ピーク CPM 相関（散布図用）。
 *
 * 設計（0.1.24 Y / ラテラル思考 L13）:
 *   各配信の「冒頭 5 分の CPM」と「全体ピーク CPM（1 分粒度）」のペアを返す。
 *   Pearson の相関係数も併記。配信開始 5 分が結果を予兆できるかの仮説検証用。
 */

/**
 * @typedef {{ capturedAt?: any }} OpeningComment
 */

/**
 * @typedef {{ liveId: string, comments: OpeningComment[] }} OpeningBroadcast
 */

const FIVE_MIN_MS = 5 * 60_000;

/**
 * @param {OpeningComment[]} comments
 * @returns {{ openingComments: number, peakCpm: number, firstAt: number|null }}
 */
function summarizeOpeningAndPeak(comments) {
  /** @type {number[]} */
  const ats = [];
  for (const c of comments) {
    if (!c || typeof c !== 'object') continue;
    const at = c.capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    ats.push(at);
  }
  if (!ats.length) return { openingComments: 0, peakCpm: 0, firstAt: null };
  ats.sort((a, b) => a - b);
  const first = ats[0];
  let opening = 0;
  /** @type {Map<number, number>} */
  const minuteBuckets = new Map();
  for (const at of ats) {
    if (at - first < FIVE_MIN_MS) opening += 1;
    const m = Math.floor((at - first) / 60_000);
    minuteBuckets.set(m, (minuteBuckets.get(m) || 0) + 1);
  }
  let peakCpm = 0;
  for (const v of minuteBuckets.values()) {
    if (v > peakCpm) peakCpm = v;
  }
  return { openingComments: opening, peakCpm, firstAt: first };
}

/**
 * @param {OpeningBroadcast[] | null | undefined} broadcasts
 * @returns {{
 *   points: { liveId: string, openingComments: number, openingCpm: number, peakCpm: number }[],
 *   correlation: number|null
 * }}
 */
export function buildOpeningFiveMinutePoints(broadcasts) {
  const list = Array.isArray(broadcasts) ? broadcasts : [];
  /** @type {{ liveId: string, openingComments: number, openingCpm: number, peakCpm: number }[]} */
  const points = [];
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    const lid = String(b.liveId || '').trim();
    if (!lid) continue;
    const cs = Array.isArray(b.comments) ? b.comments : [];
    const sum = summarizeOpeningAndPeak(cs);
    if (sum.firstAt == null) continue;
    points.push({
      liveId: lid,
      openingComments: sum.openingComments,
      openingCpm: Math.round((sum.openingComments / 5) * 100) / 100,
      peakCpm: sum.peakCpm
    });
  }
  /** @type {number|null} */
  let correlation = null;
  if (points.length >= 2) {
    const n = points.length;
    const xs = points.map((p) => p.openingCpm);
    const ys = points.map((p) => p.peakCpm);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let dx2 = 0;
    let dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - xMean;
      const dy = ys[i] - yMean;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    correlation = denom > 0 ? Math.round((num / denom) * 1000) / 1000 : null;
  }
  return { points, correlation };
}
