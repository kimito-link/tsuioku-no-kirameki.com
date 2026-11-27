/**
 * @typedef {import('./commentRecord.js').StoredComment} StoredComment
 */

import { normalizeLv } from '../shared/niconico/liveId.js';
import { extractNiconicoUserIdFromIconUrl } from '../shared/avatar/avatarUrlGuard.js';
import { isSameAvatarUrl } from './avatarUrlCompare.js';
import { parseArrivalCommentText } from './parseArrivalComment.js';
import { createArrivalNoticeGate } from './arrivalNoticeRows.js';
import { isSupportEventRow } from './estimatedViewerSpend.js';

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   avatarUrl: string,
 *   count: number,
 *   firstAt: number,
 *   lastAt: number,
 *   accountStatus?: number,
 *   followerCount?: number,
 *   followeeCount?: number,
 *   isPremium?: boolean,
 *   userLevel?: number
 * }} UserCommentProfile
 */

/**
 * @typedef {{
 *   minute: number,
 *   count: number,
 *   uniqueUsers: number
 * }} TimelineBucket
 */

/**
 * @typedef {{
 *   avgChars: number,
 *   medianChars: number,
 *   withUrlCount: number,
 *   withEmojiCount: number,
 *   pctWithUrl: number,
 *   pctWithEmoji: number
 * }} MarketingTextStats
 */

/**
 * @typedef {{
 *   count184: number,
 *   knownCount: number,
 *   pctOfKnown: number
 * }} Marketing184Stats
 */

/**
 * @typedef {{
 *   premiumCount: number,
 *   standardCount: number,
 *   knownCount: number,
 *   pctPremiumOfKnown: number
 * }} MarketingPremiumStats
 */

/**
 * @typedef {{
 *   early: number,
 *   mid: number,
 *   late: number
 * }} MarketingVposThirds
 */

/**
 * @typedef {{
 *   uniqueCommentersFirstQuarter: number,
 *   uniqueCommentersLastQuarter: number,
 *   uniqueCommentersBothQuarters: number,
 *   skippedShortSpan: boolean
 * }} MarketingQuarterEngagement
 */

/**
 * @typedef {{
 *   liveId: string,
 *   totalComments: number,
 *   uniqueUsers: number,
 *   identifiedUsers: number,
 *   unattributedComments: number,
 *   avgCommentsPerUser: number,
 *   medianCommentsPerUser: number,
 *   peakMinute: number,
 *   peakMinuteCount: number,
 *   durationMinutes: number,
 *   commentsPerMinute: number,
 *   topUsers: UserCommentProfile[],
 *   allNumericCommenters: UserCommentProfile[],
 *   commenterFollowDataset?: import('./commenterFollowCache.js').CommenterFollowLiveSnapshot|null,
 *   commenterFollowPriorEntries?: Record<string, unknown>,
 *   commenterFollowingListCache?: Record<string, unknown>,
 *   followingListCoverage?: {
 *     attempted: number,
 *     ok: number,
 *     forbidden: number,
 *     loginRequired: number,
 *     error: number,
 *     notAttempted: number
 *   },
 *   broadcasterUserId?: string,
 *   timeline: TimelineBucket[],
 *   segmentCounts: { heavy: number, mid: number, light: number, once: number },
 *   segmentPcts: { heavy: number, mid: number, light: number, once: number },
 *   hourDistribution: number[],
 *   textStats: MarketingTextStats,
 *   selfPostedCount: number,
 *   selfPostedPct: number,
 *   is184: Marketing184Stats,
 *   premium: MarketingPremiumStats,
 *   timelineCumulative: number[],
 *   timelineRolling5Min: number[],
 *   maxSilenceGapMs: number,
 *   vposThirds: MarketingVposThirds | null,
 *   quarterEngagement: MarketingQuarterEngagement,
 *   interestArrivalSummary: MarketingInterestArrivalSummary
 * }} MarketingReport
 */

/**
 * @typedef {{
 *   totalArrivals: number,
 *   uniqueTags: number,
 *   messageCount: number,
 *   topTags: { tag: string, arrivals: number, messageCount: number }[],
 *   routes?: { id: string, label: string, arrivals: number, messageCount: number }[],
 *   buckets?: { offsetMin: number, arrivals: number, comments: number }[],
 *   bucketTotal?: number
 * }} MarketingInterestArrivalSummary
 */

/**
 * マーケ topUsers の avatarUrl から、記録汚染由来の配信者アイコンや uid 不一致を除去。
 *
 * @param {UserCommentProfile[]} users
 * @param {{ broadcasterUserId?: string, broadcasterIconUrl?: string }} ctx
 * @returns {UserCommentProfile[]}
 */
function scrubMarketingTopUserAvatars(users, ctx) {
  const bUid = String(ctx?.broadcasterUserId || '').trim();
  const bIcon = String(ctx?.broadcasterIconUrl || '').trim();
  return users.map((u) => {
    const av = String(u.avatarUrl || '').trim();
    if (!av) return u;
    const uid = String(u.userId || '').trim();
    if (bUid && bIcon && uid && uid !== bUid && isSameAvatarUrl(av, bIcon)) {
      return { ...u, avatarUrl: '' };
    }
    const avUid = extractNiconicoUserIdFromIconUrl(av);
    if (avUid && /^\d+$/.test(uid) && avUid !== uid) {
      return { ...u, avatarUrl: '' };
    }
    return u;
  });
}

/**
 * レイド・加入・ギフトなど、発言ではない行。ニコ生のコメントには ytKind が無いので false。
 * @param {unknown} c
 */
export function isMarketingSupportRow(c) {
  if (!c || typeof c !== 'object') return false;
  const k = /** @type {{ ytKind?: unknown }} */ (c).ytKind;
  if (k == null || k === '') return false;
  // 値段の分からないギフト(kind=text・名前あり)も、会場で投げの演出が出る応援なので振り返りに入れる(isSupportEventRow・v0.1.2227)
  if (String(k) === 'text') return isSupportEventRow(c);
  return true;
}

/**
 * 応援の行が1件も無ければ、渡された配列そのものを返す（ニコ生は追加のコピーをしない）。
 * @param {unknown[]} comments
 */
export function speechCommentsForMarketing(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return comments;
  for (let i = 0; i < comments.length; i += 1) {
    if (isMarketingSupportRow(comments[i])) {
      return comments.filter((c) => !isMarketingSupportRow(c));
    }
  }
  return comments;
}

/**
 * StoredComment の配列からマーケティング分析用の集計を行う。
 *
 * 0.1.46 (AB): 配信者本人を KPI / CPM / uniqueUsers / timeline / segment /
 *   coreReturning 等の集計から除外する `broadcasterUserId` パラメータを追加。
 *   0.1.17 で `sectionTopUsers` と `sectionUsersWithThumbnails` の表示時
 *   フィルタは入っていたが、aggregate 層は配信者を含めたままで KPI が
 *   歪んでいた（合いの手 50 コメで CPM が +1〜2、selfPosted% も歪む）。
 *
 * @param {StoredComment[]} comments
 * @param {string} liveId
 * @param {{ broadcasterUserId?: string, broadcasterIconUrl?: string }} [opts]
 * @returns {MarketingReport}
 */
export function aggregateMarketingReport(comments, liveId, opts = {}) {
  const broadcasterUid = String(opts?.broadcasterUserId || '').trim();
  const targetLv = normalizeLv(liveId);
  const filtered = comments.filter((c) => {
    const row = /** @type {import('./commentRecord.js').StoredComment & { lvId?: string }} */ (c);
    const rowLv = normalizeLv(row.liveId ?? row.lvId ?? '');
    return (
      rowLv === targetLv &&
      c.text &&
      String(c.text).trim() &&
      !(broadcasterUid && String(c.userId || '').trim() === broadcasterUid)
    );
  });

  /** @type {StoredComment[]} */
  const engagementComments = [];
  /** @type {StoredComment[]} */
  const interestArrivalComments = [];
  /** @type {StoredComment[]} */
  const supportRows = [];
  const arrivalGate = createArrivalNoticeGate();
  for (const c of filtered) {
    if (isMarketingSupportRow(c)) {
      supportRows.push(c);
      continue;
    }
    const arrival = arrivalGate.accept(c);
    if (arrival === 'count') interestArrivalComments.push(c);
    else if (arrival === 'no') engagementComments.push(c);
  }
  const interestArrivalSummary = computeInterestArrivalSummary(interestArrivalComments, engagementComments);

  /** @type {Map<string, UserCommentProfile>} */
  const userMap = new Map();
  const timestamps = [];

  for (const c of engagementComments) {
    const uid = c.userId || `anon:${(c.commentNo || c.id || '').slice(0, 12)}`;
    const t = c.capturedAt || 0;
    timestamps.push(t);

    // accountStatus（NDGR field 4）: 2=プレミアム / 1=一般 / 0・null=不明。
    // ユーザー単位では「最も強い既知の属性」を採用する（premium が一度でも付けば premium）。
    const rowAccount =
      typeof c.accountStatus === 'number' && (c.accountStatus === 1 || c.accountStatus === 2)
        ? c.accountStatus
        : 0;
    const existing = userMap.get(uid);
    if (existing) {
      existing.count++;
      if (!existing.nickname && c.nickname) existing.nickname = c.nickname;
      if (!existing.avatarUrl && c.avatarUrl) existing.avatarUrl = c.avatarUrl;
      if (t < existing.firstAt) existing.firstAt = t;
      if (t > existing.lastAt) existing.lastAt = t;
      if (rowAccount > (existing.accountStatus || 0)) existing.accountStatus = rowAccount;
    } else {
      userMap.set(uid, {
        userId: uid,
        nickname: c.nickname || '',
        avatarUrl: c.avatarUrl || '',
        count: 1,
        firstAt: t,
        lastAt: t,
        accountStatus: rowAccount
      });
    }
  }

  let users = [...userMap.values()];
  users.sort((a, b) => b.count - a.count);
  users = scrubMarketingTopUserAvatars(users, {
    broadcasterUserId: broadcasterUid,
    broadcasterIconUrl: String(opts?.broadcasterIconUrl || '').trim()
  });
  const counts = users.map((u) => u.count).sort((a, b) => a - b);
  const median =
    counts.length === 0
      ? 0
      : counts.length % 2 === 1
        ? counts[Math.floor(counts.length / 2)]
        : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;

  /*
   * 0.1.48 (AD): Math.min(...arr) / Math.max(...arr) は spread が引数上限
   *   （V8 で 65535 程度）を超えると "Maximum call stack size exceeded" になる。
   *   8 万コメント超の人気配信者 zone でマーケ分析が無症状失敗する。
   *   reduce 化で大規模配列でも安全に min/max を取る。
   */
  let minT = 0;
  let maxT = 0;
  if (timestamps.length) {
    minT = timestamps[0];
    maxT = timestamps[0];
    for (let i = 1; i < timestamps.length; i++) {
      const t = timestamps[i];
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
  }
  const durationMs = maxT - minT;
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

  /** @type {Map<number, { count: number, uids: Set<string> }>} */
  const bucketMap = new Map();
  for (const c of engagementComments) {
    const t = c.capturedAt || 0;
    const minute = Math.floor((t - minT) / 60000);
    const uid = c.userId || `anon:${(c.commentNo || '').slice(0, 12)}`;
    let b = bucketMap.get(minute);
    if (!b) {
      b = { count: 0, uids: new Set() };
      bucketMap.set(minute, b);
    }
    b.count++;
    b.uids.add(uid);
  }

  /** @type {TimelineBucket[]} */
  const timeline = [];
  let peakMinute = 0;
  let peakMinuteCount = 0;
  // v0.1.2263: 動画のコメント(何年にもわたる投稿日)を書き出すと、1分ごとの列が百万を超えて
  //   「Maximum call stack size exceeded」になった。7日を超える幅は、1分ごとの列を作らない(山の分は下で数える)。
  const timelineMinutes = durationMinutes <= MARKETING_TIMELINE_MAX_MINUTES ? durationMinutes : -1;
  if (timelineMinutes < 0) {
    for (const [m, b] of bucketMap) {
      if (b.count > peakMinuteCount || (b.count === peakMinuteCount && m < peakMinute)) {
        peakMinute = m;
        peakMinuteCount = b.count;
      }
    }
  }
  for (let m = 0; m <= timelineMinutes; m++) {
    const b = bucketMap.get(m);
    const count = b ? b.count : 0;
    const uniqueUsers = b ? b.uids.size : 0;
    timeline.push({ minute: m, count, uniqueUsers });
    if (count > peakMinuteCount) {
      peakMinute = m;
      peakMinuteCount = count;
    }
  }

  const heavy = users.filter((u) => u.count >= 10).length;
  const mid = users.filter((u) => u.count >= 4 && u.count < 10).length;
  const light = users.filter((u) => u.count >= 2 && u.count < 4).length;
  const once = users.filter((u) => u.count === 1).length;
  const total = Math.max(1, users.length);

  /** @type {number[]} */
  const hourDistribution = new Array(24).fill(0);
  for (const t of timestamps) {
    const h = new Date(t).getHours();
    hourDistribution[h]++;
  }

  const textStats = computeTextStats(engagementComments);
  const selfPostedCount = engagementComments.filter((c) => c.selfPosted === true).length;
  const selfPostedPct =
    engagementComments.length > 0
      ? Math.round((selfPostedCount / engagementComments.length) * 1000) / 10
      : 0;
  const is184 = compute184Stats(engagementComments);
  const premium = computePremiumStats(engagementComments);
  const timelineCumulative = computeTimelineCumulative(timeline);
  const timelineRolling5Min = computeTimelineRolling5(timeline);
  const maxSilenceGapMs = computeMaxSilenceGapMs(timestamps);
  const vposThirds = computeVposThirds(engagementComments);
  const quarterEngagement = computeQuarterEngagement(engagementComments, minT, maxT);

  // v0.1.1668: 「人」として数えるのは userId のあるユーザーだけ。userId 空のコメントは、uniqueUsers では 1 コメント=1 人と
  //   数えられて参加者が過大になる(従来の値は後方互換のため残す)。ID 空は【件数】として別に出し、人には混ぜない(§12.8)。
  const identifiedSet = new Set();
  let unattributedComments = 0;
  for (const c of engagementComments) {
    const u = String(c.userId || '').trim();
    if (u) identifiedSet.add(u);
    else unattributedComments += 1;
  }

  const report = {
    liveId,
    totalComments: engagementComments.length,
    uniqueUsers: users.length,
    identifiedUsers: identifiedSet.size,
    unattributedComments,
    avgCommentsPerUser:
      users.length > 0
        ? Math.round((engagementComments.length / users.length) * 10) / 10
        : 0,
    medianCommentsPerUser: median,
    peakMinute,
    peakMinuteCount,
    durationMinutes,
    commentsPerMinute:
      Math.round((engagementComments.length / durationMinutes) * 10) / 10,
    topUsers: users.slice(0, 30),
    allNumericCommenters: users.filter((u) => /^\d{1,18}$/.test(String(u.userId || ''))),
    timeline,
    segmentCounts: { heavy, mid, light, once },
    segmentPcts: {
      heavy: Math.round((heavy / total) * 1000) / 10,
      mid: Math.round((mid / total) * 1000) / 10,
      light: Math.round((light / total) * 1000) / 10,
      once: Math.round((once / total) * 1000) / 10
    },
    hourDistribution,
    textStats,
    selfPostedCount,
    selfPostedPct,
    is184,
    premium,
    timelineCumulative,
    timelineRolling5Min,
    maxSilenceGapMs,
    vposThirds,
    quarterEngagement,
    interestArrivalSummary
  };
  if (supportRows.length) {
    /** @type {MarketingReport & { supportRows?: StoredComment[] }} */ (report).supportRows = supportRows;
  }
  return report;
}

const ARRIVAL_FIVE_MS = 5 * 60_000;
const ARRIVAL_BUCKET_CAP = 36;

/** @type {Readonly<Record<string, string>>} */
const ARRIVAL_ROUTE_LABEL = Object.freeze({
  like: '好きなタグ',
  dictionary: '大百科',
  interest: '放送者の好み',
  supporter: '放送者のサポーター',
});

const ARRIVAL_ROUTE_ORDER = Object.freeze(['like', 'dictionary', 'interest', 'supporter']);

/**
 * 来場の公式通知。人数は parseArrivalCommentText の entries を1回だけ足す。
 * 通知が0件のときは、これまでの4フィールドだけを返す（埋め込み JSON の形を変えない）。
 * @param {StoredComment[]} interestArrivalComments
 * @param {StoredComment[]} engagementComments
 */
function computeInterestArrivalSummary(interestArrivalComments, engagementComments) {
  /** @type {Map<string, { arrivals: number, messageCount: number }>} */
  const tagMap = new Map();
  /** @type {Record<string, number>} */
  const routeArrivals = { like: 0, dictionary: 0, interest: 0, supporter: 0 };
  /** @type {Record<string, number>} */
  const routeMessages = { like: 0, dictionary: 0, interest: 0, supporter: 0 };
  let totalArrivals = 0;
  let messageCount = 0;
  /** @type {Array<{ at: number, people: number }>} */
  const timed = [];

  for (const c of interestArrivalComments) {
    const parsed = parseArrivalCommentText(String(c.text || ''));
    if (!parsed) continue;
    messageCount += 1;
    totalArrivals += parsed.totalCount;
    /** @type {Set<string>} */
    const sources = new Set();
    for (const entry of parsed.entries) {
      const source = entry.source;
      if (Object.prototype.hasOwnProperty.call(routeArrivals, source)) {
        routeArrivals[source] += entry.count;
        sources.add(source);
      }
      const prev = tagMap.get(entry.keyword) || { arrivals: 0, messageCount: 0 };
      tagMap.set(entry.keyword, {
        arrivals: prev.arrivals + entry.count,
        messageCount: prev.messageCount + 1
      });
    }
    for (const source of sources) routeMessages[source] += 1;
    const at = Number(c.capturedAt) || 0;
    if (at > 0) timed.push({ at, people: parsed.totalCount });
  }

  const topTags = [...tagMap.entries()]
    .map(([tag, stats]) => ({
      tag,
      arrivals: stats.arrivals,
      messageCount: stats.messageCount
    }))
    .sort(
      (a, b) =>
        b.arrivals - a.arrivals ||
        b.messageCount - a.messageCount ||
        a.tag.localeCompare(b.tag, 'ja')
    );

  if (messageCount === 0) {
    return { totalArrivals: 0, uniqueTags: 0, messageCount: 0, topTags };
  }

  const routes = ARRIVAL_ROUTE_ORDER
    .filter((id) => routeArrivals[id] > 0)
    .map((id) => ({
      id,
      label: ARRIVAL_ROUTE_LABEL[id],
      arrivals: routeArrivals[id],
      messageCount: routeMessages[id]
    }));

  let origin = 0;
  for (const ev of timed) {
    if (!origin || ev.at < origin) origin = ev.at;
  }
  for (const c of engagementComments) {
    const at = Number(c.capturedAt) || 0;
    if (at > 0 && (!origin || at < origin)) origin = at;
  }
  /** @type {Map<number, { arrivals: number, comments: number }>} */
  const bucketMap = new Map();
  if (origin > 0 && timed.length) {
    for (const ev of timed) {
      const key = Math.floor((ev.at - origin) / ARRIVAL_FIVE_MS);
      const cell = bucketMap.get(key) || { arrivals: 0, comments: 0 };
      cell.arrivals += ev.people;
      bucketMap.set(key, cell);
    }
    for (const c of engagementComments) {
      const at = Number(c.capturedAt) || 0;
      if (!(at > 0)) continue;
      const key = Math.floor((at - origin) / ARRIVAL_FIVE_MS);
      const cell = bucketMap.get(key);
      if (!cell) continue;
      cell.comments += 1;
    }
  }
  const bucketTotal = bucketMap.size;
  const buckets = [...bucketMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, ARRIVAL_BUCKET_CAP)
    .map(([key, cell]) => ({
      offsetMin: key * 5,
      arrivals: cell.arrivals,
      comments: cell.comments
    }));

  return {
    totalArrivals,
    uniqueTags: tagMap.size,
    messageCount,
    topTags,
    routes,
    buckets,
    bucketTotal
  };
}

/** @param {StoredComment[]} filtered */
function computeTextStats(filtered) {
  const n = filtered.length;
  if (!n) {
    return {
      avgChars: 0,
      medianChars: 0,
      withUrlCount: 0,
      withEmojiCount: 0,
      pctWithUrl: 0,
      pctWithEmoji: 0
    };
  }
  const URL_RE = /https?:\/\/[^\s]+/i;
  const EMOJI_RE = /\p{Extended_Pictographic}/gu;
  const lengths = [];
  let withUrl = 0;
  let withEmoji = 0;
  for (const c of filtered) {
    const t = String(c.text || '').trim();
    lengths.push(t.length);
    if (URL_RE.test(t)) withUrl++;
    const em = t.match(EMOJI_RE);
    if (em && em.length > 0) withEmoji++;
  }
  lengths.sort((a, b) => a - b);
  const midLen =
    lengths.length % 2 === 1
      ? lengths[Math.floor(lengths.length / 2)]
      : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2;
  const sum = lengths.reduce((a, b) => a + b, 0);
  return {
    avgChars: Math.round((sum / n) * 10) / 10,
    medianChars: midLen,
    withUrlCount: withUrl,
    withEmojiCount: withEmoji,
    pctWithUrl: Math.round((withUrl / n) * 1000) / 10,
    pctWithEmoji: Math.round((withEmoji / n) * 1000) / 10
  };
}

/** @param {StoredComment[]} filtered */
function compute184Stats(filtered) {
  const known = filtered.filter((c) => typeof c.is184 === 'boolean');
  const k = known.length;
  const count184 = known.filter((c) => c.is184 === true).length;
  return {
    count184,
    knownCount: k,
    pctOfKnown: k > 0 ? Math.round((count184 / k) * 1000) / 10 : 0
  };
}

/**
 * accountStatus（NDGR field 4）の enum: 1=一般 / 2=プレミアム。0=未指定・null は
 * 「不明」として母数から除外する（DOM 取り込み行は accountStatus を持たないことが多い）。
 * @param {StoredComment[]} filtered
 * @returns {MarketingPremiumStats}
 */
function computePremiumStats(filtered) {
  let premiumCount = 0;
  let standardCount = 0;
  for (const c of filtered) {
    const s = c.accountStatus;
    if (s === 2) premiumCount += 1;
    else if (s === 1) standardCount += 1;
  }
  const knownCount = premiumCount + standardCount;
  return {
    premiumCount,
    standardCount,
    knownCount,
    pctPremiumOfKnown:
      knownCount > 0 ? Math.round((premiumCount / knownCount) * 1000) / 10 : 0
  };
}

/** 1分ごとの時系列を作る最大の幅(7日)。ライブの配信はこの中に収まる。 */
export const MARKETING_TIMELINE_MAX_MINUTES = 7 * 24 * 60;

/** @param {TimelineBucket[]} timeline */
function computeTimelineCumulative(timeline) {
  let cum = 0;
  return timeline.map((b) => {
    cum += b.count;
    return cum;
  });
}

/** @param {TimelineBucket[]} timeline */
function computeTimelineRolling5(timeline) {
  return timeline.map((_, i) => {
    let s = 0;
    const from = Math.max(0, i - 4);
    for (let j = from; j <= i; j++) {
      s += timeline[j].count;
    }
    return s;
  });
}

/** @param {number[]} timestamps */
function computeMaxSilenceGapMs(timestamps) {
  const uniq = [...new Set(timestamps.filter((t) => t > 0))].sort((a, b) => a - b);
  if (uniq.length < 2) return 0;
  let maxGap = 0;
  for (let i = 1; i < uniq.length; i++) {
    const g = uniq[i] - uniq[i - 1];
    if (g > maxGap) maxGap = g;
  }
  return maxGap;
}

const MIN_SPAN_MS_FOR_QUARTERS = 60_000;

/**
 * 記録の時間幅を4分割し、最初・最後の四分位にコメントした人数と「両方にいた」人数。
 * @param {StoredComment[]} filtered
 * @param {number} minT
 * @param {number} maxT
 * @returns {MarketingQuarterEngagement}
 */
function computeQuarterEngagement(filtered, minT, maxT) {
  const span = maxT - minT;
  if (span < MIN_SPAN_MS_FOR_QUARTERS || !filtered.length) {
    return {
      uniqueCommentersFirstQuarter: 0,
      uniqueCommentersLastQuarter: 0,
      uniqueCommentersBothQuarters: 0,
      skippedShortSpan: span < MIN_SPAN_MS_FOR_QUARTERS
    };
  }
  const q1End = minT + span / 4;
  const q4Start = maxT - span / 4;
  /** @type {Set<string>} */
  const firstQ = new Set();
  /** @type {Set<string>} */
  const lastQ = new Set();
  for (const c of filtered) {
    const t = c.capturedAt || 0;
    const uid = c.userId || `anon:${(c.commentNo || c.id || '').slice(0, 12)}`;
    if (t >= minT && t <= q1End) firstQ.add(uid);
    if (t >= q4Start && t <= maxT) lastQ.add(uid);
  }
  let both = 0;
  for (const uid of firstQ) {
    if (lastQ.has(uid)) both++;
  }
  return {
    uniqueCommentersFirstQuarter: firstQ.size,
    uniqueCommentersLastQuarter: lastQ.size,
    uniqueCommentersBothQuarters: both,
    skippedShortSpan: false
  };
}

/** @param {StoredComment[]} filtered */
function computeVposThirds(filtered) {
  const vps = filtered
    .map((c) => c.vpos)
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (vps.length < 5) return null;
  // 0.1.48 (AD): スタックオーバーフロー対策（reduce 化）
  let maxV = vps[0];
  for (let i = 1; i < vps.length; i++) {
    if (vps[i] > maxV) maxV = vps[i];
  }
  let early = 0;
  let mid = 0;
  let late = 0;
  if (maxV <= 0) {
    early = vps.length;
  } else {
    const t1 = maxV / 3;
    const t2 = (2 * maxV) / 3;
    for (const v of vps) {
      if (v < t1) early++;
      else if (v < t2) mid++;
      else late++;
    }
  }
  return { early, mid, late };
}
