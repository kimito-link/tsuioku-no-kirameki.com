/**
 * 来場者数は多いがコメントが少ない状態を検出するローカル分析コア。
 *
 * HTML / マーケ分析向けの純関数。DOM / storage / network には触れない。
 */

/**
 * @typedef {{
 *   liveId?: string,
 *   comments?: readonly unknown[],
 *   snapshot?: Record<string, unknown>|null,
 *   samples?: readonly unknown[],
 *   visitorCount?: number|null,
 *   officialCommentCount?: number|null
 * }} AudienceEngagementInput
 *
 * @typedef {{
 *   liveId?: string,
 *   broadcasterUserId?: string,
 *   minHighVisitorCount?: number,
 *   quietCommentsPer100Visitors?: number,
 *   silentCommentsPer100Visitors?: number,
 *   quietUniqueCommentersPer100Visitors?: number
 * }} AudienceEngagementOptions
 *
 * @typedef {{
 *   startAt: number,
 *   endAt: number,
 *   visitorDelta: number,
 *   commentDelta: number,
 *   commentsPer100NewVisitors: number
 * }} QuietAudienceWindow
 *
 * @typedef {{
 *   level: 'unknown' | 'healthy' | 'quiet' | 'silent-crowd',
 *   totalVisitors: number,
 *   officialCommentCount: number,
 *   recordedCommentCount: number,
 *   effectiveCommentCount: number,
 *   uniqueCommenters: number,
 *   commentsPer100Visitors: number,
 *   recordedCommentsPer100Visitors: number,
 *   uniqueCommentersPer100Visitors: number,
 *   silentVisitorEstimate: number,
 *   quietAudienceWindows: QuietAudienceWindow[],
 *   insightLines: string[]
 * }} AudienceEngagementGap
 */

const DEFAULT_HIGH_VISITOR_COUNT = 300;
const DEFAULT_QUIET_COMMENTS_PER_100 = 20;
const DEFAULT_SILENT_COMMENTS_PER_100 = 8;
const DEFAULT_QUIET_UNIQUE_PER_100 = 4;

/**
 * @param {unknown} value
 * @returns {number}
 */
function nonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function positiveTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanString(value) {
  return String(value == null ? '' : value).trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeLiveId(value) {
  const s = cleanString(value).toLowerCase();
  if (!s) return '';
  const m = s.match(/lv\d{1,15}/);
  return m ? m[0] : s;
}

/**
 * @param {unknown} row
 * @returns {string}
 */
function rowLiveId(row) {
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row || {});
  return normalizeLiveId(o.liveId) || normalizeLiveId(o.lvId);
}

/**
 * @param {unknown} row
 * @param {string} targetLiveId
 * @returns {boolean}
 */
function rowMatchesLive(row, targetLiveId) {
  if (!targetLiveId) return true;
  const own = rowLiveId(row);
  return !own || own === targetLiveId;
}

/**
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
function ratioPer100(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * @param {Record<string, unknown>|null|undefined} snapshot
 * @returns {number}
 */
function visitorCountFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  return (
    nonNegativeNumber(snapshot.viewerCountFromDom) ||
    nonNegativeNumber(snapshot.totalVisitors) ||
    nonNegativeNumber(snapshot.watchCount) ||
    nonNegativeNumber(snapshot.visitorCount)
  );
}

/**
 * @param {Record<string, unknown>|null|undefined} snapshot
 * @returns {number}
 */
function officialCommentCountFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  return (
    nonNegativeNumber(snapshot.officialCommentCount) ||
    nonNegativeNumber(snapshot.commentCount) ||
    nonNegativeNumber(snapshot.comments)
  );
}

/**
 * @param {unknown} sample
 * @returns {{ at: number, visitors: number, comments: number }|null}
 */
function normalizeSample(sample) {
  const row = /** @type {Record<string, unknown>} */ (sample || {});
  const at =
    positiveTimestamp(row.capturedAt) ||
    positiveTimestamp(row.updatedAt) ||
    positiveTimestamp(row.timestamp);
  const visitors =
    nonNegativeNumber(row.viewerCountFromDom) ||
    nonNegativeNumber(row.totalVisitors) ||
    nonNegativeNumber(row.visitorCount);
  const comments =
    nonNegativeNumber(row.officialCommentCount) ||
    nonNegativeNumber(row.commentStorageCount) ||
    nonNegativeNumber(row.commentCount);
  if (!at || (!visitors && !comments)) return null;
  return { at, visitors, comments };
}

/**
 * @param {readonly unknown[]|null|undefined} samples
 * @param {string} liveId
 * @param {number} quietCommentsPer100Visitors
 * @returns {QuietAudienceWindow[]}
 */
function findQuietAudienceWindows(samples, liveId, quietCommentsPer100Visitors) {
  const normalized = [];
  for (const raw of Array.isArray(samples) ? samples : []) {
    if (!rowMatchesLive(raw, liveId)) continue;
    const sample = normalizeSample(raw);
    if (sample) normalized.push(sample);
  }
  normalized.sort((a, b) => a.at - b.at);
  /** @type {QuietAudienceWindow[]} */
  const windows = [];
  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1];
    const cur = normalized[i];
    const visitorDelta = Math.max(0, cur.visitors - prev.visitors);
    const commentDelta = Math.max(0, cur.comments - prev.comments);
    if (visitorDelta < 50) continue;
    const commentsPer100NewVisitors = ratioPer100(commentDelta, visitorDelta);
    if (commentsPer100NewVisitors >= quietCommentsPer100Visitors) continue;
    windows.push({
      startAt: prev.at,
      endAt: cur.at,
      visitorDelta,
      commentDelta,
      commentsPer100NewVisitors
    });
  }
  return windows.slice(0, 8);
}

/**
 * @param {number} visitors
 * @param {number} commentsPer100Visitors
 * @param {number} uniquePer100Visitors
 * @param {{
 *   minHighVisitorCount: number,
 *   quietCommentsPer100Visitors: number,
 *   silentCommentsPer100Visitors: number,
 *   quietUniqueCommentersPer100Visitors: number
 * }} thresholds
 * @returns {'unknown' | 'healthy' | 'quiet' | 'silent-crowd'}
 */
function classifyEngagementLevel(
  visitors,
  commentsPer100Visitors,
  uniquePer100Visitors,
  thresholds
) {
  if (visitors <= 0) return 'unknown';
  const highVisitors = visitors >= thresholds.minHighVisitorCount;
  const veryLowComments = commentsPer100Visitors < thresholds.silentCommentsPer100Visitors;
  const lowComments = commentsPer100Visitors < thresholds.quietCommentsPer100Visitors;
  const lowUnique = uniquePer100Visitors < thresholds.quietUniqueCommentersPer100Visitors;
  if (highVisitors && veryLowComments) return 'silent-crowd';
  if (highVisitors && lowComments && lowUnique) return 'silent-crowd';
  if (lowComments || lowUnique) return 'quiet';
  return 'healthy';
}

/**
 * @param {AudienceEngagementGap} result
 * @returns {string[]}
 */
function buildInsightLines(result) {
  if (result.level === 'unknown') {
    return ['来場者数が未取得のため、来場とコメントの変換率は判定できません。'];
  }
  const lines = [];
  lines.push(
    `来場100人あたりコメントは${result.commentsPer100Visitors}件、発言者は${result.uniqueCommentersPer100Visitors}人です。`
  );
  if (result.level === 'silent-crowd') {
    lines.push('来場は多い一方で、発言に変わった割合が低い「静かな観客」状態です。');
  } else if (result.level === 'quiet') {
    lines.push('コメントへの変換はやや控えめです。問いかけや参加型の導線を増やす余地があります。');
  } else {
    lines.push('来場に対するコメント反応は十分に出ています。');
  }
  if (result.quietAudienceWindows.length > 0) {
    lines.push('来場が増えたのにコメントが伸びにくい時間帯があります。');
  }
  return lines;
}

/**
 * 「来場者数は多いけどコメントが少ない」状態を数値化する。
 *
 * @param {AudienceEngagementInput} input
 * @param {AudienceEngagementOptions} [options]
 * @returns {AudienceEngagementGap}
 */
export function analyzeAudienceEngagementGap(input, options = {}) {
  const liveId = normalizeLiveId(options.liveId) || normalizeLiveId(input?.liveId);
  const broadcasterUserId = cleanString(options.broadcasterUserId);
  const comments = [];
  const unique = new Set();
  for (const raw of Array.isArray(input?.comments) ? input.comments : []) {
    if (!rowMatchesLive(raw, liveId)) continue;
    const row = /** @type {Record<string, unknown>} */ (raw || {});
    if (!cleanString(row.text)) continue;
    const uid = cleanString(row.userId);
    if (broadcasterUserId && uid === broadcasterUserId) continue;
    comments.push(row);
    if (uid && !uid.startsWith('a:')) unique.add(uid);
  }

  const samples = Array.isArray(input?.samples) ? input.samples : [];
  let sampleMaxVisitors = 0;
  let sampleMaxComments = 0;
  for (const raw of samples) {
    if (!rowMatchesLive(raw, liveId)) continue;
    const s = normalizeSample(raw);
    if (!s) continue;
    if (s.visitors > sampleMaxVisitors) sampleMaxVisitors = s.visitors;
    if (s.comments > sampleMaxComments) sampleMaxComments = s.comments;
  }

  const totalVisitors =
    nonNegativeNumber(input?.visitorCount) ||
    visitorCountFromSnapshot(input?.snapshot) ||
    sampleMaxVisitors;
  const officialCommentCount =
    nonNegativeNumber(input?.officialCommentCount) ||
    officialCommentCountFromSnapshot(input?.snapshot) ||
    sampleMaxComments;
  const recordedCommentCount = comments.length;
  const effectiveCommentCount = Math.max(officialCommentCount, recordedCommentCount);
  const uniqueCommenters = unique.size;

  const commentsPer100Visitors = ratioPer100(effectiveCommentCount, totalVisitors);
  const recordedCommentsPer100Visitors = ratioPer100(recordedCommentCount, totalVisitors);
  const uniqueCommentersPer100Visitors = ratioPer100(uniqueCommenters, totalVisitors);
  const thresholds = {
    minHighVisitorCount:
      Math.max(1, Math.trunc(Number(options.minHighVisitorCount) || DEFAULT_HIGH_VISITOR_COUNT)),
    quietCommentsPer100Visitors:
      nonNegativeNumber(options.quietCommentsPer100Visitors) || DEFAULT_QUIET_COMMENTS_PER_100,
    silentCommentsPer100Visitors:
      nonNegativeNumber(options.silentCommentsPer100Visitors) || DEFAULT_SILENT_COMMENTS_PER_100,
    quietUniqueCommentersPer100Visitors:
      nonNegativeNumber(options.quietUniqueCommentersPer100Visitors) || DEFAULT_QUIET_UNIQUE_PER_100
  };

  const level = classifyEngagementLevel(
    totalVisitors,
    commentsPer100Visitors,
    uniqueCommentersPer100Visitors,
    thresholds
  );

  /** @type {AudienceEngagementGap} */
  const result = {
    level,
    totalVisitors: Math.round(totalVisitors),
    officialCommentCount: Math.round(officialCommentCount),
    recordedCommentCount,
    effectiveCommentCount: Math.round(effectiveCommentCount),
    uniqueCommenters,
    commentsPer100Visitors,
    recordedCommentsPer100Visitors,
    uniqueCommentersPer100Visitors,
    silentVisitorEstimate: Math.max(0, Math.round(totalVisitors - uniqueCommenters)),
    quietAudienceWindows: findQuietAudienceWindows(
      samples,
      liveId,
      thresholds.quietCommentsPer100Visitors
    ),
    insightLines: []
  };
  result.insightLines = buildInsightLines(result);
  return result;
}
