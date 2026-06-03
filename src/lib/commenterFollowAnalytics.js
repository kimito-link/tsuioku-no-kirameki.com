/**
 * 数値IDコメンターのフォロー情報を、マーケ分析HTMLで扱いやすい形へ整える純関数群。
 * chrome API / DOM / fetch には依存しない。
 *
 * v0.1.610 (OSINT Phase 2-B): `buildCommenterFollowAnalytics` の opts に
 * `includeSupporterPower: true` を渡すと、応援者パワー診断(A〜E・0-100)の
 * supporterPowerRows と supporterPowerSummary を追加 export する。
 * 既存 return は名前も型も変更しない(Codex 設計の互換性方針)。
 * 設計: docs/codex-supporter-power-scoring-design-v0607.md
 */

import {
  computeAllSupporterPowers,
  buildSupporterPowerSummary
} from './supporterPowerScoring.js';

export const COMMENTER_FOLLOW_CSV_BOM = '\ufeff';

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   avatarUrl: string,
 *   commentCount: number,
 *   followerCount?: number,
 *   followeeCount?: number,
 *   userLevel?: number,
 *   isPremium?: boolean,
 *   accountStatus?: number,
 *   firstAt?: number,
 *   lastAt?: number,
 *   followFetchedAt?: number
 * }} CommenterFollowAnalyticsRow
 */

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   label: string,
 *   followerCount: number,
 *   commentCount: number,
 *   segmentId: 'highFollowerRegulars'|'localEnthusiasts'|'quietSupporters'|'other'
 * }} CommenterFollowScatterPoint
 */

/**
 * @typedef {{
 *   sampleSize: number,
 *   highPercentile: number,
 *   followerCount: { median: number, percentile: number, threshold: number },
 *   commentCount: { median: number, percentile: number, threshold: number }
 * }} CommenterFollowThresholds
 */

/**
 * @typedef {{
 *   id: 'highFollowerRegulars'|'localEnthusiasts'|'quietSupporters',
 *   label: string,
 *   description: string,
 *   count: number,
 *   pctOfFollowed: number,
 *   summary: string,
 *   representatives: CommenterFollowAnalyticsRow[],
 *   rows: CommenterFollowAnalyticsRow[]
 * }} CommenterFollowSegment
 */

/**
 * v0.1.610 Phase 2-B: 応援者パワー診断行(SupporterPower の row 形）。
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   commentCount: number,
 *   giftTotalPoints: number,
 *   loyaltyCount: number|null,
 *   followerCount: number|null,
 *   followeeCount: number|null,
 *   isPremium: boolean|null,
 *   userLevel: number|null,
 *   power: {
 *     score: number,
 *     tier: 'S'|'A'|'B'|'C'|'D'|'E',
 *     components: { engagement: number, loyalty: number, influence: number },
 *     percentile: number,
 *     coverage: { hasGiftData: boolean, influenceFieldsAvailable: number }
 *   },
 *   segmentId: 'highFollowerRegulars'|'localEnthusiasts'|'quietSupporters'|'other'
 * }} SupporterPowerRowEx
 */

/**
 * @typedef {{
 *   rows: CommenterFollowAnalyticsRow[],
 *   rowsWithFollowerCount: CommenterFollowAnalyticsRow[],
 *   thresholds: CommenterFollowThresholds,
 *   scatterPoints: CommenterFollowScatterPoint[],
 *   segments: {
 *     highFollowerRegulars: CommenterFollowSegment,
 *     localEnthusiasts: CommenterFollowSegment,
 *     quietSupporters: CommenterFollowSegment
 *   },
 *   followDeltas: CommenterFollowDeltaAnalysis,
 *   followeeProfile: CommenterFolloweeProfileAnalysis,
 *   followTiming: CommenterFollowTimingAnalysis,
 *   broadcasterFollow: CommenterBroadcasterFollowAnalysis,
 *   commonFollowees: CommenterCommonFolloweeRow[],
 *   followingListInsights: string[],
 *   supporterPowerRows?: SupporterPowerRowEx[],
 *   supporterPowerSummary?: {
 *     sampleSize: number,
 *     tierCounts: Record<'S'|'A'|'B'|'C'|'D'|'E', number>,
 *     medianScore: number,
 *     topRows: SupporterPowerRowEx[]
 *   }
 * }} CommenterFollowAnalytics
 */

/**
 * @typedef {{
 *   followedCount: number,
 *   sampleSize: number,
 *   pct: number,
 *   notFetchedCount: number,
 *   broadcasterUserId: string
 * }} CommenterBroadcasterFollowAnalysis
 */

/**
 * @typedef {{
 *   userId: string,
 *   overlapCount: number
 * }} CommenterCommonFolloweeRow
 */

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   followerDelta: number,
 *   followeeDelta: number,
 *   priorFollowerCount: number,
 *   currentFollowerCount: number,
 *   currentFolloweeCount?: number,
 *   commentCount: number,
 *   firstAt?: number,
 *   priorFetchedAt?: number
 * }} CommenterFollowDeltaRow
 */

/**
 * @typedef {{
 *   comparedCount: number,
 *   increased: CommenterFollowDeltaRow[],
 *   decreased: CommenterFollowDeltaRow[],
 *   unchangedCount: number,
 *   netFollowerDelta: number,
 *   netFolloweeDelta: number,
 *   insightLines: string[]
 * }} CommenterFollowDeltaAnalysis
 */

/**
 * @typedef {{
 *   label: string,
 *   count: number,
 *   pct: number
 * }} CommenterFollowProfileBucket
 */

/**
 * @typedef {{
 *   sampleSize: number,
 *   medianFolloweeCount: number,
 *   premiumPct: number,
 *   levelBuckets: CommenterFollowProfileBucket[],
 *   followeeBuckets: CommenterFollowProfileBucket[],
 *   insightLines: string[]
 * }} CommenterFolloweeProfileAnalysis
 */

/**
 * @typedef {{
 *   label: string,
 *   commenterCount: number,
 *   increasedCount: number,
 *   decreasedCount: number,
 *   netFollowerDelta: number
 * }} CommenterFollowTimingBucket
 */

/**
 * @typedef {{
 *   buckets: CommenterFollowTimingBucket[],
 *   insightLines: string[]
 * }} CommenterFollowTimingAnalysis
 */

/**
 * @param {unknown} v
 * @returns {Record<string, unknown>|null}
 */
function asRecord(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? /** @type {Record<string, unknown>} */ (v)
    : null;
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function nonNegativeIntOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * @param {unknown} v
 * @returns {number|undefined}
 */
function nonNegativeIntOrUndefined(v) {
  const n = nonNegativeIntOrNull(v);
  return n == null ? undefined : n;
}

/**
 * @param {unknown} v
 * @returns {boolean|undefined}
 */
function boolOrUndefined(v) {
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * @param {unknown[]} values
 * @returns {unknown}
 */
function firstDefined(values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/**
 * @param {unknown} dataset
 * @returns {Map<string, Record<string, unknown>>}
 */
function followDatasetRowMap(dataset) {
  const out = new Map();
  const ds = asRecord(dataset);
  const rows = Array.isArray(ds?.rows) ? ds.rows : [];
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) continue;
    const uid = String(row.userId || '').trim();
    if (!uid) continue;
    out.set(uid, row);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} src
 * @param {Record<string, unknown>|undefined} follow
 * @returns {CommenterFollowAnalyticsRow|null}
 */
function analyticsRowFromRecords(src, follow) {
  const uid = String(firstDefined([src.userId, follow?.userId]) || '').trim();
  if (!uid) return null;
  const commentCount =
    nonNegativeIntOrNull(firstDefined([src.count, src.commentCount, follow?.commentCount])) ?? 0;
  /** @type {CommenterFollowAnalyticsRow} */
  const row = {
    userId: uid,
    nickname: String(firstDefined([src.nickname, follow?.nickname]) || '').trim(),
    avatarUrl: String(src.avatarUrl || '').trim(),
    commentCount
  };

  const followerCount = nonNegativeIntOrUndefined(firstDefined([src.followerCount, follow?.followerCount]));
  const followeeCount = nonNegativeIntOrUndefined(firstDefined([src.followeeCount, follow?.followeeCount]));
  const userLevel = nonNegativeIntOrUndefined(
    firstDefined([src.userLevel, src.level, follow?.userLevel, follow?.level])
  );
  const accountStatus = nonNegativeIntOrUndefined(src.accountStatus);
  const firstAt = nonNegativeIntOrUndefined(src.firstAt);
  const lastAt = nonNegativeIntOrUndefined(src.lastAt);
  const followFetchedAt = nonNegativeIntOrUndefined(
    firstDefined([src.followFetchedAt, follow?.followFetchedAt, follow?.fetchedAt])
  );
  const isPremium = boolOrUndefined(firstDefined([src.isPremium, follow?.isPremium]));

  if (followerCount !== undefined) row.followerCount = followerCount;
  if (followeeCount !== undefined) row.followeeCount = followeeCount;
  if (userLevel !== undefined && userLevel > 0) row.userLevel = userLevel;
  if (isPremium !== undefined) row.isPremium = isPremium;
  if (accountStatus !== undefined) row.accountStatus = accountStatus;
  if (firstAt !== undefined) row.firstAt = firstAt;
  if (lastAt !== undefined) row.lastAt = lastAt;
  if (followFetchedAt !== undefined) row.followFetchedAt = followFetchedAt;
  return row;
}

/**
 * `allNumericCommenters` と `commenterFollowDataset.rows` のどちらの形でも扱えるよう正規化する。
 *
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string }} [opts]
 * @returns {CommenterFollowAnalyticsRow[]}
 */
export function normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts = {}) {
  const src = Array.isArray(allNumericCommenters) ? allNumericCommenters : [];
  const followMap = followDatasetRowMap(opts.commenterFollowDataset);
  const excludeUid = String(opts.excludeUserId || '').trim();
  /** @type {CommenterFollowAnalyticsRow[]} */
  const out = [];
  const seen = new Set();

  for (const item of src) {
    const record = asRecord(item);
    if (!record) continue;
    const uid = String(record.userId || '').trim();
    const row = analyticsRowFromRecords(record, uid ? followMap.get(uid) : undefined);
    if (!row) continue;
    if (excludeUid && row.userId === excludeUid) continue;
    out.push(row);
    seen.add(row.userId);
  }

  for (const [uid, follow] of followMap) {
    if (seen.has(uid)) continue;
    if (excludeUid && uid === excludeUid) continue;
    const row = analyticsRowFromRecords(follow, undefined);
    if (row) out.push(row);
  }

  out.sort((a, b) => b.commentCount - a.commentCount || a.userId.localeCompare(b.userId));
  return out;
}

/**
 * 線形補間 percentile。`percentileValue` は 0〜100。
 * @param {readonly number[]} values
 * @param {number} percentileValue
 * @returns {number}
 */
export function computePercentile(values, percentileValue) {
  const nums = values
    .filter((v) => Number.isFinite(v))
    .map((v) => Number(v))
    .sort((a, b) => a - b);
  if (!nums.length) return 0;
  const pct = Math.max(0, Math.min(100, Number(percentileValue)));
  const idx = ((nums.length - 1) * pct) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return nums[lo];
  const weight = idx - lo;
  return nums[lo] * (1 - weight) + nums[hi] * weight;
}

/**
 * フォロワー数が取れている行だけを母集団にして中央値・上位percentileのしきい値を出す。
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string, highPercentile?: number }} [opts]
 * @returns {CommenterFollowThresholds}
 */
export function computeCommenterFollowThresholds(allNumericCommenters, opts = {}) {
  const rows = normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts).filter(
    (row) => typeof row.followerCount === 'number'
  );
  const highPercentile = Number.isFinite(Number(opts.highPercentile))
    ? Math.max(0, Math.min(100, Number(opts.highPercentile)))
    : 75;
  const followerValues = rows.map((row) => Number(row.followerCount));
  const commentValues = rows.map((row) => row.commentCount);
  const followerPct = computePercentile(followerValues, highPercentile);
  const commentPct = computePercentile(commentValues, highPercentile);
  return {
    sampleSize: rows.length,
    highPercentile,
    followerCount: {
      median: computePercentile(followerValues, 50),
      percentile: followerPct,
      threshold: rows.length ? Math.max(1, Math.ceil(followerPct)) : 0
    },
    commentCount: {
      median: computePercentile(commentValues, 50),
      percentile: commentPct,
      threshold: rows.length ? Math.max(1, Math.ceil(commentPct)) : 0
    }
  };
}

/**
 * @param {CommenterFollowAnalyticsRow} row
 * @param {CommenterFollowThresholds} thresholds
 * @returns {'highFollowerRegulars'|'localEnthusiasts'|'quietSupporters'|'other'}
 */
function classifySegment(row, thresholds) {
  const followerHigh =
    typeof row.followerCount === 'number' &&
    thresholds.followerCount.threshold > 0 &&
    row.followerCount >= thresholds.followerCount.threshold;
  const commentHigh =
    thresholds.commentCount.threshold > 0 &&
    row.commentCount >= thresholds.commentCount.threshold;
  if (followerHigh && commentHigh) return 'highFollowerRegulars';
  if (!followerHigh && commentHigh) return 'localEnthusiasts';
  if (followerHigh && !commentHigh) return 'quietSupporters';
  return 'other';
}

/**
 * @param {number} count
 * @param {number} total
 * @returns {number}
 */
function pctOf(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

/**
 * @param {CommenterFollowSegment['id']} id
 * @param {string} label
 * @param {string} description
 * @param {CommenterFollowAnalyticsRow[]} rows
 * @param {number} total
 * @returns {CommenterFollowSegment}
 */
function makeSegment(id, label, description, rows, total) {
  const count = rows.length;
  const pct = pctOf(count, total);
  return {
    id,
    label,
    description,
    count,
    pctOfFollowed: pct,
    summary: `${label}は${count}名（フォロワー数取得済みの${pct}%）です。${description}`,
    representatives: rows.slice(0, 3),
    rows
  };
}

/**
 * 自動セグメントを作る。機械学習ではなく、フォロワー数とコメント数のしきい値による目安。
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string, highPercentile?: number, thresholds?: CommenterFollowThresholds }} [opts]
 * @returns {CommenterFollowAnalytics['segments']}
 */
export function buildCommenterFollowSegments(allNumericCommenters, opts = {}) {
  const thresholds =
    opts.thresholds || computeCommenterFollowThresholds(allNumericCommenters, opts);
  const rows = normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts).filter(
    (row) => typeof row.followerCount === 'number'
  );
  /** @type {CommenterFollowAnalyticsRow[]} */
  const highFollowerRegulars = [];
  /** @type {CommenterFollowAnalyticsRow[]} */
  const localEnthusiasts = [];
  /** @type {CommenterFollowAnalyticsRow[]} */
  const quietSupporters = [];

  for (const row of rows) {
    const id = classifySegment(row, thresholds);
    if (id === 'highFollowerRegulars') highFollowerRegulars.push(row);
    else if (id === 'localEnthusiasts') localEnthusiasts.push(row);
    else if (id === 'quietSupporters') quietSupporters.push(row);
  }

  /**
   * @param {CommenterFollowAnalyticsRow} a
   * @param {CommenterFollowAnalyticsRow} b
   */
  const byCommentThenFollower = (a, b) =>
    b.commentCount - a.commentCount ||
    (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0);
  /**
   * @param {CommenterFollowAnalyticsRow} a
   * @param {CommenterFollowAnalyticsRow} b
   */
  const byFollowerThenComment = (a, b) =>
    (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0) ||
    b.commentCount - a.commentCount;

  highFollowerRegulars.sort(byCommentThenFollower);
  localEnthusiasts.sort(byCommentThenFollower);
  quietSupporters.sort(byFollowerThenComment);

  return {
    highFollowerRegulars: makeSegment(
      'highFollowerRegulars',
      '高フォロワー常連',
      '外から見つかりやすい人が、この配信でも継続的に反応している層です。',
      highFollowerRegulars,
      rows.length
    ),
    localEnthusiasts: makeSegment(
      'localEnthusiasts',
      'ローカル熱心層',
      '外部フォロワー規模より、この枠での参加量が強く出た層です。',
      localEnthusiasts,
      rows.length
    ),
    quietSupporters: makeSegment(
      'quietSupporters',
      '静かな支援',
      '外部フォロワー規模は大きめでも、この枠では少数コメントで支えていた層です。',
      quietSupporters,
      rows.length
    )
  };
}

/**
 * SVG散布図用の点データを作る。
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string, highPercentile?: number, thresholds?: CommenterFollowThresholds }} [opts]
 * @returns {CommenterFollowScatterPoint[]}
 */
export function buildCommenterFollowScatterPoints(allNumericCommenters, opts = {}) {
  const thresholds =
    opts.thresholds || computeCommenterFollowThresholds(allNumericCommenters, opts);
  return normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts)
    .filter((row) => typeof row.followerCount === 'number')
    .map((row) => ({
      userId: row.userId,
      nickname: row.nickname,
      label: row.nickname || row.userId,
      followerCount: Number(row.followerCount),
      commentCount: row.commentCount,
      segmentId: classifySegment(row, thresholds)
    }));
}

/**
 * 横断キャッシュの過去値と今回スナップショットを比較し、フォロワー/フォロー数の増減を出す。
 * @param {CommenterFollowAnalyticsRow[]} rows
 * @param {Record<string, unknown>} [priorMap]
 * @returns {CommenterFollowDeltaAnalysis}
 */
export function analyzeCommenterFollowDeltas(rows, priorMap = {}) {
  const prior = priorMap && typeof priorMap === 'object' ? priorMap : {};
  /** @type {CommenterFollowDeltaRow[]} */
  const increased = [];
  /** @type {CommenterFollowDeltaRow[]} */
  const decreased = [];
  let unchangedCount = 0;
  let comparedCount = 0;
  let netFollowerDelta = 0;
  let netFolloweeDelta = 0;

  for (const row of rows) {
    if (typeof row.followerCount !== 'number') continue;
    const rawPrior = prior[row.userId];
    const prevRec = asRecord(rawPrior);
    if (!prevRec) continue;
    const prevFollower = nonNegativeIntOrNull(prevRec.followerCount);
    if (prevFollower === null) continue;
    const prevFollowee = nonNegativeIntOrNull(prevRec.followeeCount) ?? 0;
    const prevFetchedAt = nonNegativeIntOrNull(prevRec.fetchedAt) ?? 0;
    const curFetchedAt = row.followFetchedAt ?? 0;
    if (curFetchedAt > 0 && prevFetchedAt > 0 && curFetchedAt <= prevFetchedAt) continue;

    const dFollower = row.followerCount - prevFollower;
    const dFollowee = (row.followeeCount ?? 0) - prevFollowee;
    comparedCount += 1;
    netFollowerDelta += dFollower;
    netFolloweeDelta += dFollowee;

    if (dFollower === 0 && dFollowee === 0) {
      unchangedCount += 1;
      continue;
    }

    /** @type {CommenterFollowDeltaRow} */
    const deltaRow = {
      userId: row.userId,
      nickname: row.nickname,
      followerDelta: dFollower,
      followeeDelta: dFollowee,
      priorFollowerCount: prevFollower,
      currentFollowerCount: row.followerCount,
      commentCount: row.commentCount,
      priorFetchedAt: prevFetchedAt || undefined
    };
    if (typeof row.followeeCount === 'number') deltaRow.currentFolloweeCount = row.followeeCount;
    if (typeof row.firstAt === 'number') deltaRow.firstAt = row.firstAt;

    if (dFollower > 0 || (dFollower === 0 && dFollowee > 0)) increased.push(deltaRow);
    else decreased.push(deltaRow);
  }

  increased.sort(
    (a, b) =>
      b.followerDelta - a.followerDelta ||
      b.followeeDelta - a.followeeDelta ||
      b.commentCount - a.commentCount
  );
  decreased.sort(
    (a, b) =>
      a.followerDelta - b.followerDelta ||
      a.followeeDelta - b.followeeDelta ||
      b.commentCount - a.commentCount
  );

  /** @type {string[]} */
  const insightLines = [];
  if (comparedCount > 0) {
    insightLines.push(
      `キャッシュ比較 ${comparedCount}名中、フォロワー増 ${increased.length}名・減 ${decreased.length}名（純増 ${netFollowerDelta >= 0 ? '+' : ''}${netFollowerDelta}）。`
    );
    if (netFolloweeDelta !== 0) {
      insightLines.push(
        `フォロー数（followee）の純増減は ${netFolloweeDelta >= 0 ? '+' : ''}${netFolloweeDelta} です。`
      );
    }
  } else {
    insightLines.push(
      '前回キャッシュとの比較データがまだありません。配信をまたいで同じコメンターが取れると増減が見えます。'
    );
  }

  return {
    comparedCount,
    increased,
    decreased,
    unchangedCount,
    netFollowerDelta,
    netFolloweeDelta,
    insightLines
  };
}

/**
 * コメンター本人の followeeCount・プレミアム・LV から「フォロー先の量・属性」の傾向を出す。
 * @param {CommenterFollowAnalyticsRow[]} rows
 * @returns {CommenterFolloweeProfileAnalysis}
 */
export function analyzeCommenterFolloweeProfile(rows) {
  const withFollowee = rows.filter((row) => typeof row.followeeCount === 'number');
  const withLevel = rows.filter((row) => typeof row.userLevel === 'number' && row.userLevel > 0);
  const premiumCount = rows.filter((row) => row.isPremium === true).length;
  const followeeValues = withFollowee.map((row) => Number(row.followeeCount));

  /** @type {CommenterFollowProfileBucket[]} */
  const followeeBuckets = [
    { label: '0〜50人', count: 0, pct: 0 },
    { label: '51〜200人', count: 0, pct: 0 },
    { label: '201〜500人', count: 0, pct: 0 },
    { label: '501人以上', count: 0, pct: 0 }
  ];
  for (const row of withFollowee) {
    const n = Number(row.followeeCount);
    if (n <= 50) followeeBuckets[0].count += 1;
    else if (n <= 200) followeeBuckets[1].count += 1;
    else if (n <= 500) followeeBuckets[2].count += 1;
    else followeeBuckets[3].count += 1;
  }
  for (const bucket of followeeBuckets) {
    bucket.pct = pctOf(bucket.count, withFollowee.length);
  }

  /** @type {CommenterFollowProfileBucket[]} */
  const levelBuckets = [
    { label: 'LV 1〜9', count: 0, pct: 0 },
    { label: 'LV 10〜19', count: 0, pct: 0 },
    { label: 'LV 20〜29', count: 0, pct: 0 },
    { label: 'LV 30+', count: 0, pct: 0 }
  ];
  for (const row of withLevel) {
    const lv = Number(row.userLevel);
    if (lv < 10) levelBuckets[0].count += 1;
    else if (lv < 20) levelBuckets[1].count += 1;
    else if (lv < 30) levelBuckets[2].count += 1;
    else levelBuckets[3].count += 1;
  }
  for (const bucket of levelBuckets) {
    bucket.pct = pctOf(bucket.count, withLevel.length);
  }

  /** @type {string[]} */
  const insightLines = [];
  if (withFollowee.length) {
    const median = computePercentile(followeeValues, 50);
    insightLines.push(
      `コメンター ${withFollowee.length}名のフォロー数（followee）中央値は ${Math.round(median)} 人です。`
    );
    const heavy = followeeBuckets[3].count + followeeBuckets[2].count;
    if (heavy > 0) {
      insightLines.push(
        `201人以上フォローしている層が ${heavy}名（${pctOf(heavy, withFollowee.length)}%）。`
      );
    }
  }
  if (rows.length) {
    insightLines.push(`プレミアム会員は ${premiumCount}名（${pctOf(premiumCount, rows.length)}%）。`);
  }

  return {
    sampleSize: withFollowee.length,
    medianFolloweeCount: followeeValues.length ? Math.round(computePercentile(followeeValues, 50)) : 0,
    premiumPct: pctOf(premiumCount, rows.length),
    levelBuckets,
    followeeBuckets,
    insightLines
  };
}

/**
 * 初コメ時刻の四分位ごとに、フォロワー増減が起きたコメンターを集計する。
 * @param {CommenterFollowAnalyticsRow[]} rows
 * @param {CommenterFollowDeltaAnalysis} deltas
 * @param {{ durationMs?: number }} [opts]
 * @returns {CommenterFollowTimingAnalysis}
 */
export function analyzeCommenterFollowTimingByCommentWindow(rows, deltas, opts = {}) {
  const labels = ['序盤(0-25%)', '前半(25-50%)', '後半(50-75%)', '終盤(75-100%)'];
  /** @type {CommenterFollowTimingBucket[]} */
  const buckets = labels.map((label) => ({
    label,
    commenterCount: 0,
    increasedCount: 0,
    decreasedCount: 0,
    netFollowerDelta: 0
  }));

  const timedRows = rows.filter((row) => typeof row.firstAt === 'number' && row.firstAt > 0);
  if (!timedRows.length) {
    return {
      buckets,
      insightLines: ['初コメ時刻が取れないため、配信内タイミング別の増減は出せません。']
    };
  }

  const firstTimes = timedRows.map((row) => Number(row.firstAt));
  const minAt = Math.min(...firstTimes);
  const maxAt = Math.max(...firstTimes);
  const spanMs =
    Number.isFinite(Number(opts.durationMs)) && Number(opts.durationMs) > 0
      ? Number(opts.durationMs)
      : Math.max(1, maxAt - minAt);

  /** @type {Map<string, CommenterFollowDeltaRow>} */
  const deltaByUid = new Map();
  for (const row of deltas.increased) deltaByUid.set(row.userId, row);
  for (const row of deltas.decreased) deltaByUid.set(row.userId, row);

  for (const row of timedRows) {
    const rel = Math.max(0, Math.min(1, (Number(row.firstAt) - minAt) / spanMs));
    const idx = Math.min(3, Math.floor(rel * 4));
    buckets[idx].commenterCount += 1;
    const delta = deltaByUid.get(row.userId);
    if (!delta) continue;
    if (delta.followerDelta > 0 || (delta.followerDelta === 0 && delta.followeeDelta > 0)) {
      buckets[idx].increasedCount += 1;
    } else if (delta.followerDelta < 0 || (delta.followerDelta === 0 && delta.followeeDelta < 0)) {
      buckets[idx].decreasedCount += 1;
    }
    buckets[idx].netFollowerDelta += delta.followerDelta;
  }

  /** @type {string[]} */
  const insightLines = [];
  const busiest = buckets.reduce((best, bucket) =>
    bucket.increasedCount + bucket.decreasedCount > best.increasedCount + best.decreasedCount
      ? bucket
      : best
  );
  if (busiest.increasedCount + busiest.decreasedCount > 0) {
    insightLines.push(
      `フォロワー増減が目立ったのは ${busiest.label}（増 ${busiest.increasedCount} / 減 ${busiest.decreasedCount}）。`
    );
  } else if (deltas.comparedCount > 0) {
    insightLines.push('初コメ時刻帯ごとの増減差は小さめです。');
  }

  return { buckets, insightLines };
}

/**
 * フォロー一覧取得済みコメンターのうち、配信者をフォローしている人数。
 * @param {CommenterFollowAnalyticsRow[]} rows
 * @param {Record<string, unknown>} [listMap]
 * @param {string} [broadcasterUserId]
 * @returns {CommenterBroadcasterFollowAnalysis}
 */
export function analyzeCommenterBroadcasterFollow(rows, listMap = {}, broadcasterUserId = '') {
  const bUid = String(broadcasterUserId || '').trim();
  const map = listMap && typeof listMap === 'object' ? listMap : {};
  let sampleSize = 0;
  let followedCount = 0;
  let notFetchedCount = 0;
  const seen = new Set();
  for (const row of rows) {
    const uid = String(row.userId || '').trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const hit = asRecord(map[uid]);
    if (!hit || hit.status !== 'ok') {
      notFetchedCount += 1;
      continue;
    }
    sampleSize += 1;
    const ids = Array.isArray(hit.userIds) ? hit.userIds.map((v) => String(v)) : [];
    if (bUid && ids.includes(bUid)) followedCount += 1;
  }
  return {
    followedCount,
    sampleSize,
    pct: pctOf(followedCount, sampleSize),
    notFetchedCount,
    broadcasterUserId: bUid
  };
}

/**
 * 複数コメンターが共通してフォローしている userId TOP。
 * @param {Record<string, unknown>} [listMap]
 * @param {{ topN?: number, minOverlap?: number }} [opts]
 * @returns {CommenterCommonFolloweeRow[]}
 */
export function analyzeCommonFolloweesAmongCommenters(listMap = {}, opts = {}) {
  const map = listMap && typeof listMap === 'object' ? listMap : {};
  const topN =
    Number.isFinite(Number(opts.topN)) && Number(opts.topN) > 0
      ? Math.floor(Number(opts.topN))
      : 20;
  const minOverlap =
    Number.isFinite(Number(opts.minOverlap)) && Number(opts.minOverlap) > 1
      ? Math.floor(Number(opts.minOverlap))
      : 2;
  /** @type {Map<string, number>} */
  const counter = new Map();
  for (const entryRaw of Object.values(map)) {
    const entry = asRecord(entryRaw);
    if (!entry || entry.status !== 'ok') continue;
    const ids = Array.isArray(entry.userIds) ? entry.userIds : [];
    const seen = new Set();
    for (const rawId of ids) {
      const uid = String(rawId || '').trim();
      if (!/^\d{1,18}$/.test(uid) || seen.has(uid)) continue;
      seen.add(uid);
      counter.set(uid, (counter.get(uid) || 0) + 1);
    }
  }
  return [...counter.entries()]
    .filter(([, count]) => count >= minOverlap)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([userId, overlapCount]) => ({ userId, overlapCount }));
}

/**
 * @param {CommenterBroadcasterFollowAnalysis} broadcasterFollow
 * @param {{ attempted?: number, ok?: number, forbidden?: number, loginRequired?: number, error?: number, notAttempted?: number }|undefined} coverage
 * @returns {string[]}
 */
export function buildCommenterFollowingListInsights(broadcasterFollow, coverage) {
  /** @type {string[]} */
  const lines = [];
  if (coverage?.loginRequired > 0) {
    lines.push(
      'ニコニコにログインした状態でレポートを出力すると、上位コメンターのフォロー先一覧が取得できます。'
    );
  }
  if (coverage?.error > 0 && !coverage?.loginRequired) {
    lines.push(
      `${coverage.error}名のフォロー一覧取得に失敗しました。ニコニコにログインしているか確認し、レポートを再出力してください。`
    );
  }
  if (coverage?.notAttempted > 0 && coverage?.attempted === 0) {
    lines.push('フォロー一覧はまだ取得していません。配信中またはレポート出力時に上位コメンターから順に取得します。');
  }
  if (coverage?.forbidden > 0) {
    lines.push(`${coverage.forbidden}名は公開設定によりフォロー一覧を取得できませんでした。`);
  }
  if (broadcasterFollow.sampleSize > 0 && broadcasterFollow.broadcasterUserId) {
    lines.push(
      `フォロー一覧取得済み ${broadcasterFollow.sampleSize}名のうち ${broadcasterFollow.followedCount}名が配信者をフォロー（${broadcasterFollow.pct}%）。`
    );
  } else if (broadcasterFollow.notFetchedCount > 0 && !lines.length) {
    lines.push('配信者フォロー率を出すには、上位コメンターのフォロー一覧取得が必要です。');
  }
  return lines;
}

/**
 * しきい値・点・セグメントをまとめて返す。
 *
 * v0.1.610 (OSINT Phase 2-B): `includeSupporterPower: true` の opt-in で
 *   応援者パワー診断(A〜E・0-100、設計は docs/codex-supporter-power-scoring-design-v0607.md)
 *   の rows と summary を追加 export する。既存 return は名前も型も一切変更しない
 *   (Codex 設計の互換性方針)。
 *
 * @param {unknown} allNumericCommenters
 * @param {{
 *   commenterFollowDataset?: unknown,
 *   excludeUserId?: string,
 *   highPercentile?: number,
 *   priorFollowEntries?: Record<string, unknown>,
 *   durationMs?: number,
 *   followingListMap?: Record<string, unknown>,
 *   followingListCoverage?: Record<string, unknown>,
 *   includeSupporterPower?: boolean,
 *   giftTotalsByUserId?: Record<string, number>,
 *   loyaltyCountsByUserId?: Record<string, number>,
 *   loyaltyWindowSize?: number,
 *   availableLiveCount?: number,
 *   supporterPowerTopN?: number
 * }} [opts]
 * @returns {CommenterFollowAnalytics}
 */
export function buildCommenterFollowAnalytics(allNumericCommenters, opts = {}) {
  const rows = normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts);
  const thresholds = computeCommenterFollowThresholds(rows, {
    highPercentile: opts.highPercentile
  });
  const rowsWithFollowerCount = rows.filter((row) => typeof row.followerCount === 'number');
  const followDeltas = analyzeCommenterFollowDeltas(rows, opts.priorFollowEntries);
  const followeeProfile = analyzeCommenterFolloweeProfile(rows);
  const followTiming = analyzeCommenterFollowTimingByCommentWindow(rows, followDeltas, {
    durationMs: opts.durationMs
  });
  const broadcasterFollow = analyzeCommenterBroadcasterFollow(
    rows,
    opts.followingListMap,
    opts.excludeUserId
  );
  const commonFollowees = analyzeCommonFolloweesAmongCommenters(opts.followingListMap, {
    topN: 20
  });
  const followingListInsights = buildCommenterFollowingListInsights(
    broadcasterFollow,
    opts.followingListCoverage
  );

  /** @type {CommenterFollowAnalytics} */
  const out = {
    rows,
    rowsWithFollowerCount,
    thresholds,
    scatterPoints: buildCommenterFollowScatterPoints(rows, { thresholds }),
    segments: buildCommenterFollowSegments(rows, { thresholds }),
    followDeltas,
    followeeProfile,
    followTiming,
    broadcasterFollow,
    commonFollowees,
    followingListInsights
  };

  // v0.1.610 Phase 2-B: opt-in で応援者パワー診断を計算。既存 fields は維持。
  if (opts.includeSupporterPower === true) {
    const sp = buildSupporterPowerOutputs(rows, opts);
    if (sp) {
      out.supporterPowerRows = sp.supporterPowerRows;
      out.supporterPowerSummary = sp.supporterPowerSummary;
    }
  }

  return out;
}

/**
 * v0.1.610 Phase 2-B: rows + opts から応援者パワー診断の出力を組み立てる。
 *
 * 既存 row(`CommenterFollowAnalyticsRow`)を SupporterInput に変換 →
 * computeAllSupporterPowers で 0-100 score / Tier / percentile を計算 →
 * 既存 row の補助フィールド(`segmentId`)も付けて返す。
 *
 * @param {CommenterFollowAnalyticsRow[]} rows
 * @param {{
 *   giftTotalsByUserId?: Record<string, number>,
 *   loyaltyCountsByUserId?: Record<string, number>,
 *   loyaltyWindowSize?: number,
 *   availableLiveCount?: number,
 *   highPercentile?: number,
 *   supporterPowerTopN?: number
 * }} opts
 * @returns {{
 *   supporterPowerRows: SupporterPowerRowEx[],
 *   supporterPowerSummary: {
 *     sampleSize: number,
 *     tierCounts: Record<'S'|'A'|'B'|'C'|'D'|'E', number>,
 *     medianScore: number,
 *     topRows: SupporterPowerRowEx[]
 *   }
 * }|null}
 */
function buildSupporterPowerOutputs(rows, opts) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  /** @type {Record<string, number>} */
  const giftTotals = opts.giftTotalsByUserId && typeof opts.giftTotalsByUserId === 'object'
    ? /** @type {any} */ (opts.giftTotalsByUserId)
    : {};
  /** @type {Record<string, number>} */
  const loyaltyCounts = opts.loyaltyCountsByUserId && typeof opts.loyaltyCountsByUserId === 'object'
    ? /** @type {any} */ (opts.loyaltyCountsByUserId)
    : {};

  // 既存 row → SupporterInput
  const inputs = rows.map((r) => {
    const giftRaw = giftTotals[r.userId];
    const giftTotalPoints =
      typeof giftRaw === 'number' && Number.isFinite(giftRaw) && giftRaw >= 0 ? giftRaw : 0;
    const loyaltyRaw = loyaltyCounts[r.userId];
    /** @type {number|undefined} */
    let loyaltyCount;
    if (typeof loyaltyRaw === 'number' && Number.isFinite(loyaltyRaw) && loyaltyRaw >= 0) {
      loyaltyCount = Math.floor(loyaltyRaw);
    }
    /** @type {{
     *   userId: string, nickname: string, commentCount: number,
     *   giftTotalPoints: number, loyaltyCount?: number,
     *   followerCount?: number, followeeCount?: number,
     *   isPremium?: boolean, userLevel?: number
     * }} */
    const input = {
      userId: r.userId,
      nickname: r.nickname,
      commentCount: r.commentCount,
      giftTotalPoints
    };
    if (loyaltyCount !== undefined) input.loyaltyCount = loyaltyCount;
    if (typeof r.followerCount === 'number') input.followerCount = r.followerCount;
    if (typeof r.followeeCount === 'number') input.followeeCount = r.followeeCount;
    if (typeof r.isPremium === 'boolean') input.isPremium = r.isPremium;
    if (typeof r.userLevel === 'number') input.userLevel = r.userLevel;
    return input;
  });

  const { rows: computed } = computeAllSupporterPowers(inputs, {
    loyaltyWindowSize: opts.loyaltyWindowSize,
    availableLiveCount: opts.availableLiveCount
  });

  // 既存セグメント分類を取り、行ごとに segmentId を付与する補助マップ。
  // 「diagnostic Tier」と「解釈 segment」の併用は設計レポート §472 の方針。
  const thresholdsForSeg = computeCommenterFollowThresholds(rows, {
    highPercentile: opts.highPercentile
  });
  const segs = buildCommenterFollowSegments(rows, { thresholds: thresholdsForSeg });
  /** @type {Record<string, 'highFollowerRegulars'|'localEnthusiasts'|'quietSupporters'|'other'>} */
  const segmentMap = {};
  for (const segId of /** @type {const} */ ([
    'highFollowerRegulars',
    'localEnthusiasts',
    'quietSupporters'
  ])) {
    const bucket = /** @type {any} */ (segs?.[segId]);
    const rowsForBucket = Array.isArray(bucket?.rows) ? bucket.rows : [];
    for (const seg of rowsForBucket) {
      if (seg?.userId) segmentMap[String(seg.userId)] = segId;
    }
  }

  /** @type {SupporterPowerRowEx[]} */
  const supporterPowerRows = computed.map((c) => ({
    userId: c.input.userId,
    nickname: c.input.nickname || '',
    commentCount: c.input.commentCount,
    giftTotalPoints: c.input.giftTotalPoints,
    loyaltyCount: c.input.loyaltyCount ?? null,
    followerCount: c.input.followerCount ?? null,
    followeeCount: c.input.followeeCount ?? null,
    isPremium: c.input.isPremium ?? null,
    userLevel: c.input.userLevel ?? null,
    power: c.power,
    segmentId: segmentMap[c.input.userId] || 'other'
  }));

  const topN =
    typeof opts.supporterPowerTopN === 'number' && opts.supporterPowerTopN > 0
      ? Math.floor(opts.supporterPowerTopN)
      : 10;
  const summary = buildSupporterPowerSummary(
    computed.map((c) => ({ input: c.input, power: c.power })),
    { topN }
  );
  // summary.topRows は { input, power } 形なので、UI 用に supporterPowerRows と同じ shape に詰め直す
  const topUidSet = new Set(summary.topRows.map((r) => r.input.userId));
  const topRowsEx = supporterPowerRows.filter((r) => topUidSet.has(r.userId));
  // summary.topRows と同じ順序を維持
  /** @type {Record<string, number>} */
  const orderIndex = {};
  summary.topRows.forEach((r, i) => { orderIndex[r.input.userId] = i; });
  topRowsEx.sort((a, b) => (orderIndex[a.userId] ?? 0) - (orderIndex[b.userId] ?? 0));

  return {
    supporterPowerRows,
    supporterPowerSummary: {
      sampleSize: summary.sampleSize,
      tierCounts: summary.tierCounts,
      medianScore: summary.medianScore,
      topRows: topRowsEx
    }
  };
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function csvCell(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV向けの行データ。フィールド名は埋め込みJSONのキーに寄せる。
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string }} [opts]
 * @returns {Array<Record<string, string|number|boolean>>}
 */
export function buildCommenterFollowCsvRows(allNumericCommenters, opts = {}) {
  return normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts).map((row) => ({
    userId: row.userId,
    nickname: row.nickname,
    commentCount: row.commentCount,
    followerCount: row.followerCount ?? '',
    followeeCount: row.followeeCount ?? '',
    userLevel: row.userLevel ?? '',
    isPremium: row.isPremium ?? '',
    accountStatus: row.accountStatus ?? '',
    firstAt: row.firstAt ?? '',
    lastAt: row.lastAt ?? '',
    followFetchedAt: row.followFetchedAt ?? '',
    avatarUrl: row.avatarUrl
  }));
}

/**
 * Excelで開きやすい UTF-8 BOM 付きCSVを組み立てる。
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string, includeBom?: boolean }} [opts]
 * @returns {string}
 */
export function buildCommenterFollowCsvText(allNumericCommenters, opts = {}) {
  const rows = buildCommenterFollowCsvRows(allNumericCommenters, opts);
  const headers = [
    'userId',
    'nickname',
    'commentCount',
    'followerCount',
    'followeeCount',
    'userLevel',
    'isPremium',
    'accountStatus',
    'firstAt',
    'lastAt',
    'followFetchedAt',
    'avatarUrl'
  ];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(','))
  ];
  return `${opts.includeBom === false ? '' : COMMENTER_FOLLOW_CSV_BOM}${lines.join('\r\n')}`;
}

/**
 * Excelで開きやすい UTF-8 BOM 付きCSVを組み立てる公開API。
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string, includeBom?: boolean }} [opts]
 * @returns {string}
 */
export function buildCommenterFollowCsv(allNumericCommenters, opts = {}) {
  return buildCommenterFollowCsvText(allNumericCommenters, opts);
}
