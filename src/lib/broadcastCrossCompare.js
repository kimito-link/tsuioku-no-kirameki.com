/**
 * 0.1.24 (Y): 横断比較系の純粋関数群。
 *
 *   - buildRecentBroadcastComparison … 直近 N 配信のコメ数 / ユニーク / 配信時間 を bar 用に
 *   - buildWeekdayHourHeatmap        … 7曜日 × 24時間 のコメ密度ヒートマップ
 *   - computeBroadcastGrowthScore    … 過去 N 配信平均との偏差（成長メーター用 z-score）
 *   - buildBroadcasterCrossComparison … 自分 vs 理想の配信者をローカル記録だけで比較
 */

/**
 * @typedef {{ userId?: any, capturedAt?: any }} CrossCompareCommentInput
 */

/**
 * @typedef {{
 *   liveId: string,
 *   comments: CrossCompareCommentInput[],
 *   broadcasterName?: string,
 *   snapshot?: Record<string, unknown>,
 *   giftPoints?: number
 * }} CrossCompareBroadcast
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

/** @param {unknown} value */
function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** @param {number} value */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 視聴者 uid を表示用に短縮 SHA-256 化する。ハッシュできない環境では null を返し、
 * 呼び出し側は uid を表示しない。
 *
 * @param {unknown} uid
 * @returns {Promise<string|null>}
 */
export async function hashViewerUserId(uid) {
  const raw = String(uid ?? '').trim();
  if (!raw) return null;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') return null;
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/**
 * @param {CrossCompareBroadcast} broadcast
 * @param {string[]} keys
 */
function pickBroadcastNumber(broadcast, keys) {
  for (const key of keys) {
    const direct = toFiniteNumber(/** @type {Record<string, unknown>} */ (broadcast)[key]);
    if (direct != null) return direct;
    const nested = toFiniteNumber(broadcast?.snapshot?.[key]);
    if (nested != null) return nested;
  }
  return null;
}

/**
 * @param {CrossCompareBroadcast[]} broadcasts
 * @param {string} label
 */
function summarizeBroadcastGroup(broadcasts, label) {
  const list = Array.isArray(broadcasts) ? broadcasts.filter(Boolean) : [];
  /** @type {Map<string, number>} */
  const userCounts = new Map();
  let totalComments = 0;
  let totalDurationMin = 0;
  let totalGiftPoints = 0;
  let giftPointSamples = 0;
  let peakComments = 0;
  let peakLiveId = '';
  for (const b of list) {
    const comments = Array.isArray(b?.comments) ? b.comments : [];
    const { first, last } = spanOfComments(comments);
    const durationMin =
      first != null && last != null ? Math.max(0, (last - first) / 60_000) : 0;
    totalComments += comments.length;
    totalDurationMin += durationMin;
    if (comments.length > peakComments) {
      peakComments = comments.length;
      peakLiveId = String(b?.liveId || '');
    }
    const giftPoints = pickBroadcastNumber(b, ['giftPoints', 'totalGiftPoints', 'programGiftPoints']);
    if (giftPoints != null && giftPoints >= 0) {
      totalGiftPoints += giftPoints;
      giftPointSamples += 1;
    }
    for (const c of comments) {
      const uid = String(c?.userId ?? '').trim();
      if (!uid) continue;
      userCounts.set(uid, (userCounts.get(uid) || 0) + 1);
    }
  }
  const broadcastCount = list.length;
  const averageComments = broadcastCount > 0 ? totalComments / broadcastCount : 0;
  const averageDurationMin = broadcastCount > 0 ? totalDurationMin / broadcastCount : 0;
  const commentsPerMinute = totalDurationMin > 0 ? totalComments / totalDurationMin : 0;
  return {
    label,
    broadcastCount,
    totalComments,
    averageComments: round2(averageComments),
    uniqueUsers: userCounts.size,
    averageDurationMin: round2(averageDurationMin),
    commentsPerMinute: round2(commentsPerMinute),
    totalGiftPoints,
    averageGiftPoints: giftPointSamples > 0 ? round2(totalGiftPoints / giftPointSamples) : 0,
    peakLiveId,
    peakComments,
    userCounts
  };
}

/**
 * @param {ReturnType<typeof summarizeBroadcastGroup>} self
 * @param {ReturnType<typeof summarizeBroadcastGroup>} ideal
 */
function buildCrossCompareTakeaways(self, ideal) {
  const out = [];
  const cpmGap = round2(ideal.commentsPerMinute - self.commentsPerMinute);
  const giftGap = round2(ideal.averageGiftPoints - self.averageGiftPoints);
  const uniqueGap = ideal.uniqueUsers - self.uniqueUsers;
  if (cpmGap > 0) {
    out.push(`理想配信者はコメント密度が +${cpmGap.toLocaleString('ja-JP')} 件/分高いです。コメントの山を作った話題や時間帯を見直す価値があります。`);
  } else if (cpmGap < 0) {
    out.push(`自分の配信はコメント密度が ${Math.abs(cpmGap).toLocaleString('ja-JP')} 件/分上回っています。維持できた場面を次回の型にできます。`);
  }
  if (uniqueGap > 0) {
    out.push(`理想配信者はユニーク参加者が +${uniqueGap.toLocaleString('ja-JP')} 人多いです。初見・匿名コメントが反応した導入を比較してください。`);
  }
  if (giftGap > 0) {
    out.push(`理想配信者は平均ギフト pt が +${giftGap.toLocaleString('ja-JP')} pt 高いです。ギフトが動いた直前のコメント流量と話題を重ねて見ると差分が出ます。`);
  }
  if (!out.length) {
    out.push('主要指標は近い水準です。配信ごとのピーク時刻と応援者の重なりを個別に見る段階です。');
  }
  return out;
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

/**
 * 自分の配信群と、ローカルに記録済みの理想配信者の配信群を比較する。
 * sharedViewerHashes は必ず SHA-256 短縮 hash のみを返し、raw uid は返さない。
 *
 * @param {{
 *   selfBroadcasts?: CrossCompareBroadcast[],
 *   idealBroadcasts?: CrossCompareBroadcast[],
 *   selfLabel?: string,
 *   idealLabel?: string,
 *   sharedUserLimit?: number
 * } | null | undefined} input
 * @returns {Promise<{
 *   self: Omit<ReturnType<typeof summarizeBroadcastGroup>, 'userCounts'>,
 *   ideal: Omit<ReturnType<typeof summarizeBroadcastGroup>, 'userCounts'>,
 *   deltas: {
 *     averageComments: number,
 *     uniqueUsers: number,
 *     commentsPerMinute: number,
 *     averageGiftPoints: number
 *   },
 *   sharedViewerHashes: { hash: string, selfComments: number, idealComments: number }[],
 *   takeaways: string[]
 * }>}
 */
export async function buildBroadcasterCrossComparison(input) {
  const params = input && typeof input === 'object' ? input : {};
  const self = summarizeBroadcastGroup(
    Array.isArray(params.selfBroadcasts) ? params.selfBroadcasts : [],
    String(params.selfLabel || '自分')
  );
  const ideal = summarizeBroadcastGroup(
    Array.isArray(params.idealBroadcasts) ? params.idealBroadcasts : [],
    String(params.idealLabel || '理想の配信者')
  );
  const limit =
    typeof params.sharedUserLimit === 'number' && params.sharedUserLimit > 0
      ? Math.floor(params.sharedUserLimit)
      : 5;
  const shared = [];
  for (const [uid, selfComments] of self.userCounts.entries()) {
    const idealComments = ideal.userCounts.get(uid) || 0;
    if (idealComments <= 0) continue;
    const hash = await hashViewerUserId(uid);
    if (!hash) continue;
    shared.push({ hash, selfComments, idealComments });
  }
  shared.sort((a, b) => b.selfComments + b.idealComments - (a.selfComments + a.idealComments));

  /** @param {ReturnType<typeof summarizeBroadcastGroup>} group */
  const stripUsers = (group) => {
    const rest = { ...group };
    delete rest.userCounts;
    return rest;
  };

  return {
    self: stripUsers(self),
    ideal: stripUsers(ideal),
    deltas: {
      averageComments: round2(ideal.averageComments - self.averageComments),
      uniqueUsers: ideal.uniqueUsers - self.uniqueUsers,
      commentsPerMinute: round2(ideal.commentsPerMinute - self.commentsPerMinute),
      averageGiftPoints: round2(ideal.averageGiftPoints - self.averageGiftPoints)
    },
    sharedViewerHashes: shared.slice(0, limit),
    takeaways: buildCrossCompareTakeaways(self, ideal)
  };
}
