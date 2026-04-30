/**
 * 0.1.24 (Y): 横断比較系の純粋関数群。
 *
 *   - buildRecentBroadcastComparison … 直近 N 配信のコメ数 / ユニーク / 配信時間 を bar 用に
 *   - buildWeekdayHourHeatmap        … 7曜日 × 24時間 のコメ密度ヒートマップ
 *   - computeBroadcastGrowthScore    … 過去 N 配信平均との偏差（成長メーター用 z-score）
 */

/**
 * @typedef {{ userId?: any, capturedAt?: any }} CrossCompareCommentInput
 */

/**
 * @typedef {{ liveId: string, comments: CrossCompareCommentInput[] }} CrossCompareBroadcast
 */

/**
 * @param {CrossCompareCommentInput[]} comments
 * @returns {{ first: number|null, last: number|null }}
 */
function spanOfComments(comments) {
  /** @type {number|null} */
  let first = null;
  /** @type {number|null} */
  let last = null;
  for (const c of comments) {
    if (!c || typeof c !== 'object') continue;
    const at = c.capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    if (first == null || at < first) first = at;
    if (last == null || at > last) last = at;
  }
  return { first, last };
}

/**
 * @param {{ broadcasts?: CrossCompareBroadcast[], limit?: number } | null | undefined} input
 * @returns {{
 *   bars: {
 *     liveId: string,
 *     totalComments: number,
 *     uniqueUsers: number,
 *     durationMin: number,
 *     firstCapturedAt: number|null
 *   }[]
 * }}
 */
export function buildRecentBroadcastComparison(input) {
  const params = input && typeof input === 'object' ? input : {};
  const broadcasts = Array.isArray(params.broadcasts) ? params.broadcasts : [];
  const limit =
    typeof params.limit === 'number' && params.limit > 0 ? Math.floor(params.limit) : 5;
  const all = [];
  for (const b of broadcasts) {
    if (!b || typeof b !== 'object') continue;
    const lid = String(b.liveId || '').trim();
    if (!lid) continue;
    const cs = Array.isArray(b.comments) ? b.comments : [];
    const { first, last } = spanOfComments(cs);
    /** @type {Set<string>} */
    const uniq = new Set();
    for (const c of cs) {
      const uid = c?.userId == null ? '' : String(c.userId).trim();
      if (uid) uniq.add(uid);
    }
    all.push({
      liveId: lid,
      totalComments: cs.length,
      uniqueUsers: uniq.size,
      durationMin: first != null && last != null ? Math.round((last - first) / 60_000) : 0,
      firstCapturedAt: first
    });
  }
  // sort by firstCapturedAt asc, then take last `limit`
  all.sort((a, b) => {
    const av = a.firstCapturedAt == null ? -Infinity : a.firstCapturedAt;
    const bv = b.firstCapturedAt == null ? -Infinity : b.firstCapturedAt;
    return av - bv;
  });
  const bars = all.slice(Math.max(0, all.length - limit));
  return { bars };
}

/**
 * @param {{ broadcasts?: CrossCompareBroadcast[] } | null | undefined} input
 * @returns {{ matrix: number[][], maxValue: number }}
 */
export function buildWeekdayHourHeatmap(input) {
  const params = input && typeof input === 'object' ? input : {};
  const broadcasts = Array.isArray(params.broadcasts) ? params.broadcasts : [];
  /** @type {number[][]} */
  const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const b of broadcasts) {
    if (!b || typeof b !== 'object') continue;
    const cs = Array.isArray(b.comments) ? b.comments : [];
    for (const c of cs) {
      const at = c?.capturedAt;
      if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
      const d = new Date(at);
      const dow = d.getDay(); // 0=Sun ... 6=Sat (local time)
      const hour = d.getHours();
      if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
        matrix[dow][hour] += 1;
      }
    }
  }
  let maxValue = 0;
  for (const row of matrix) {
    for (const v of row) if (v > maxValue) maxValue = v;
  }
  return { matrix, maxValue };
}

/**
 * @param {{ currentValue?: number, pastValues?: number[] } | null | undefined} input
 * @returns {{
 *   average: number|null,
 *   stdDev: number|null,
 *   zScore: number|null,
 *   deltaPct: number|null
 * }}
 */
export function computeBroadcastGrowthScore(input) {
  const params = input && typeof input === 'object' ? input : {};
  const past = Array.isArray(params.pastValues)
    ? params.pastValues.filter((v) => typeof v === 'number' && Number.isFinite(v))
    : [];
  const current =
    typeof params.currentValue === 'number' && Number.isFinite(params.currentValue)
      ? params.currentValue
      : 0;
  if (!past.length) {
    return { average: null, stdDev: null, zScore: null, deltaPct: null };
  }
  const sum = past.reduce((a, b) => a + b, 0);
  const avg = sum / past.length;
  const variance =
    past.reduce((a, b) => a + (b - avg) ** 2, 0) / past.length;
  const stdDev = Math.sqrt(variance);
  /** @type {number|null} */
  const zScore = stdDev > 0 ? Math.round(((current - avg) / stdDev) * 100) / 100 : null;
  const deltaPct =
    avg > 0 ? Math.round(((current - avg) / avg) * 10_000) / 10_000 : 0;
  return {
    average: Math.round(avg * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    zScore,
    deltaPct
  };
}
