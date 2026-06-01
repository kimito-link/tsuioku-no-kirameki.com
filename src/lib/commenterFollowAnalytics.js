/**
 * 数値IDコメンターのフォロー情報を、マーケ分析HTMLで扱いやすい形へ整える純関数群。
 * chrome API / DOM / fetch には依存しない。
 */

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
 * @typedef {{
 *   rows: CommenterFollowAnalyticsRow[],
 *   rowsWithFollowerCount: CommenterFollowAnalyticsRow[],
 *   thresholds: CommenterFollowThresholds,
 *   scatterPoints: CommenterFollowScatterPoint[],
 *   segments: {
 *     highFollowerRegulars: CommenterFollowSegment,
 *     localEnthusiasts: CommenterFollowSegment,
 *     quietSupporters: CommenterFollowSegment
 *   }
 * }} CommenterFollowAnalytics
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
 * しきい値・点・セグメントをまとめて返す。
 * @param {unknown} allNumericCommenters
 * @param {{ commenterFollowDataset?: unknown, excludeUserId?: string, highPercentile?: number }} [opts]
 * @returns {CommenterFollowAnalytics}
 */
export function buildCommenterFollowAnalytics(allNumericCommenters, opts = {}) {
  const rows = normalizeCommenterFollowAnalyticsRows(allNumericCommenters, opts);
  const thresholds = computeCommenterFollowThresholds(rows, {
    highPercentile: opts.highPercentile
  });
  const rowsWithFollowerCount = rows.filter((row) => typeof row.followerCount === 'number');
  return {
    rows,
    rowsWithFollowerCount,
    thresholds,
    scatterPoints: buildCommenterFollowScatterPoints(rows, { thresholds }),
    segments: buildCommenterFollowSegments(rows, { thresholds })
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
