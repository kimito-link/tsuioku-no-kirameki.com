/**
 * @typedef {{
 *   commentCount: number,
 *   activeMinute: number,
 *   continuityRatio: number,
 *   giftPoint: number,
 *   giftCount: number,
 *   earlyEvent: number,
 *   quietEvent: number,
 *   mixedSupportBonus: number
 * }} SupporterContributionWeights
 *
 * @typedef {{
 *   weights?: Partial<SupporterContributionWeights>,
 *   earlyWindowMs?: number,
 *   earlyWindowRatio?: number,
 *   lateWindowMs?: number,
 *   lateWindowRatio?: number,
 *   quietBucketMs?: number,
 *   quietBucketRatio?: number,
 *   highGiftPointThreshold?: number,
 *   heavyCommentThreshold?: number,
 *   continuityHighlightRatio?: number,
 *   minDurationForContinuityMs?: number
 * }} SupporterContributionOptions
 *
 * @typedef {{
 *   comments?: unknown[],
 *   giftThrows?: unknown[],
 *   gifts?: unknown[],
 *   options?: SupporterContributionOptions
 * }} SupporterContributionInput
 *
 * @typedef {{
 *   commentCount: number,
 *   commentScore: number,
 *   giftPointTotal: number,
 *   giftPointScore: number,
 *   giftCount: number,
 *   giftCountScore: number,
 *   continuityRatio: number,
 *   activeMinutes: number,
 *   continuityScore: number,
 *   earlyEventCount: number,
 *   earlySupportScore: number,
 *   quietEventCount: number,
 *   quietSupportScore: number,
 *   mixedSupportBonus: number,
 *   firstAt: number|null,
 *   lastAt: number|null,
 *   isAnonymous: boolean
 * }} SupporterContributionBreakdown
 *
 * @typedef {{
 *   userKey: string,
 *   displayName: string,
 *   score: number,
 *   breakdown: SupporterContributionBreakdown,
 *   rank: number,
 *   highlights: string[]
 * }} SupporterContributionResult
 *
 * @typedef {{
 *   userKey: string,
 *   displayName: string,
 *   isAnonymous: boolean,
 *   kind: 'comment'|'gift',
 *   timestamp: number|null,
 *   units: number,
 *   points: number
 * }} ContributionEvent
 *
 * @typedef {{
 *   userKey: string,
 *   displayName: string,
 *   isAnonymous: boolean,
 *   commentCount: number,
 *   giftPointTotal: number,
 *   giftCount: number,
 *   maxGiftPoint: number,
 *   firstAt: number,
 *   lastAt: number,
 *   activeBuckets: Set<number>,
 *   timedEvents: ContributionEvent[],
 *   earlyEventCount: number,
 *   quietEventCount: number
 * }} SupporterAccumulator
 */

/** @type {Readonly<SupporterContributionWeights>} */
export const SUPPORTER_CONTRIBUTION_DEFAULT_WEIGHTS = Object.freeze({
  commentCount: 1,
  activeMinute: 1.5,
  continuityRatio: 24,
  giftPoint: 0.04,
  giftCount: 6,
  earlyEvent: 2.5,
  quietEvent: 3.5,
  mixedSupportBonus: 10
});

/** @type {Readonly<Required<Omit<SupporterContributionOptions, 'weights'>>>} */
export const SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS = Object.freeze({
  earlyWindowMs: 5 * 60 * 1000,
  earlyWindowRatio: 0.2,
  lateWindowMs: 5 * 60 * 1000,
  lateWindowRatio: 0.2,
  quietBucketMs: 60 * 1000,
  quietBucketRatio: 0.55,
  highGiftPointThreshold: 1000,
  heavyCommentThreshold: 10,
  continuityHighlightRatio: 0.72,
  minDurationForContinuityMs: 10 * 60 * 1000
});

/**
 * 録画済みコメントとギフト履歴から、応援者ごとの貢献度を降順で返す。
 * storage には触れず、渡された配列だけを読む純関数。
 *
 * @param {unknown[]|SupporterContributionInput} commentsOrInput
 * @param {unknown[]=} giftThrowsArg
 * @param {SupporterContributionOptions=} optionsArg
 * @returns {SupporterContributionResult[]}
 */
export function scoreSupporterContributions(
  commentsOrInput,
  giftThrowsArg = [],
  optionsArg = {}
) {
  const resolved = resolveInput(commentsOrInput, giftThrowsArg, optionsArg);
  const options = normalizeOptions(resolved.options);
  /** @type {Map<string, SupporterAccumulator>} */
  const byUser = new Map();
  /** @type {ContributionEvent[]} */
  const timedEvents = [];

  for (const event of normalizeCommentEvents(resolved.comments)) {
    addContributionEvent(byUser, timedEvents, event);
  }
  for (const event of normalizeGiftEvents(resolved.giftThrows)) {
    addContributionEvent(byUser, timedEvents, event);
  }
  if (byUser.size === 0) return [];

  const timing = buildTimingContext(timedEvents, options);
  applyTimingSignals(byUser, timing);

  const results = [...byUser.values()].map((acc) =>
    buildContributionResult(acc, timing, options)
  );
  results.sort(compareContributionResults);
  return results.map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * @param {unknown[]|SupporterContributionInput} commentsOrInput
 * @param {unknown[]} giftThrowsArg
 * @param {SupporterContributionOptions} optionsArg
 * @returns {{comments: unknown[], giftThrows: unknown[], options: SupporterContributionOptions}}
 */
function resolveInput(commentsOrInput, giftThrowsArg, optionsArg) {
  if (
    commentsOrInput &&
    typeof commentsOrInput === 'object' &&
    !Array.isArray(commentsOrInput) &&
    ('comments' in commentsOrInput ||
      'giftThrows' in commentsOrInput ||
      'gifts' in commentsOrInput)
  ) {
    const input = /** @type {SupporterContributionInput} */ (commentsOrInput);
    return {
      comments: Array.isArray(input.comments) ? input.comments : [],
      giftThrows: Array.isArray(input.giftThrows)
        ? input.giftThrows
        : Array.isArray(input.gifts)
          ? input.gifts
          : [],
      options: { ...(input.options || {}), ...(optionsArg || {}) }
    };
  }
  return {
    comments: Array.isArray(commentsOrInput) ? commentsOrInput : [],
    giftThrows: Array.isArray(giftThrowsArg) ? giftThrowsArg : [],
    options: optionsArg || {}
  };
}

/**
 * @param {SupporterContributionOptions|undefined} options
 * @returns {Required<SupporterContributionOptions> & {weights: SupporterContributionWeights}}
 */
function normalizeOptions(options) {
  const opts = options || {};
  return {
    weights: {
      ...SUPPORTER_CONTRIBUTION_DEFAULT_WEIGHTS,
      ...(opts.weights || {})
    },
    earlyWindowMs: positiveNumberOr(
      opts.earlyWindowMs,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.earlyWindowMs
    ),
    earlyWindowRatio: ratioOr(
      opts.earlyWindowRatio,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.earlyWindowRatio
    ),
    lateWindowMs: positiveNumberOr(
      opts.lateWindowMs,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.lateWindowMs
    ),
    lateWindowRatio: ratioOr(
      opts.lateWindowRatio,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.lateWindowRatio
    ),
    quietBucketMs: positiveNumberOr(
      opts.quietBucketMs,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.quietBucketMs
    ),
    quietBucketRatio: ratioOr(
      opts.quietBucketRatio,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.quietBucketRatio
    ),
    highGiftPointThreshold: positiveNumberOr(
      opts.highGiftPointThreshold,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.highGiftPointThreshold
    ),
    heavyCommentThreshold: positiveNumberOr(
      opts.heavyCommentThreshold,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.heavyCommentThreshold
    ),
    continuityHighlightRatio: ratioOr(
      opts.continuityHighlightRatio,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.continuityHighlightRatio
    ),
    minDurationForContinuityMs: positiveNumberOr(
      opts.minDurationForContinuityMs,
      SUPPORTER_CONTRIBUTION_DEFAULT_OPTIONS.minDurationForContinuityMs
    )
  };
}

/**
 * @param {unknown[]} comments
 * @returns {ContributionEvent[]}
 */
function normalizeCommentEvents(comments) {
  /** @type {ContributionEvent[]} */
  const events = [];
  for (const raw of comments) {
    if (!raw || typeof raw !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (raw);
    const text = firstText(row, ['text', 'content', 'body', 'message']);
    if (!text) continue;
    const userKey = resolveCommentUserKey(row);
    if (!userKey) continue;
    const displayName = resolveDisplayName(row, userKey);
    const timestamp = timestampOrNull(
      row.capturedAt ?? row.timestamp ?? row.at ?? row.createdAt
    );
    events.push({
      userKey,
      displayName,
      isAnonymous: isAnonymousUserKey(userKey),
      kind: 'comment',
      timestamp,
      units: 1,
      points: 0
    });
  }
  return events;
}

/**
 * @param {unknown[]} gifts
 * @returns {ContributionEvent[]}
 */
function normalizeGiftEvents(gifts) {
  /** @type {ContributionEvent[]} */
  const events = [];
  for (const raw of gifts) {
    if (!raw || typeof raw !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (raw);
    const displayName = firstText(row, [
      'nickname',
      'displayName',
      'senderName',
      'name',
      'advertiserName'
    ]);
    const userKey = resolveGiftUserKey(row, displayName);
    if (!userKey) continue;
    const points = nonNegativeNumberOr(
      row.totalPoints ?? row.points ?? row.point ?? row.amount,
      0
    );
    const count = positiveIntegerOr(
      row.throwCount ?? row.giftCount ?? row.count ?? row.throws,
      1
    );
    const timestamp = timestampOrNull(
      row.capturedAt ?? row.timestamp ?? row.at ?? row.createdAt
    );
    events.push({
      userKey,
      displayName: displayName || fallbackDisplayName(userKey),
      isAnonymous: isAnonymousUserKey(userKey),
      kind: 'gift',
      timestamp,
      units: count,
      points
    });
  }
  return events;
}

/**
 * @param {Map<string, SupporterAccumulator>} byUser
 * @param {ContributionEvent[]} timedEvents
 * @param {ContributionEvent} event
 */
function addContributionEvent(byUser, timedEvents, event) {
  let acc = byUser.get(event.userKey);
  if (!acc) {
    acc = {
      userKey: event.userKey,
      displayName: event.displayName || fallbackDisplayName(event.userKey),
      isAnonymous: event.isAnonymous,
      commentCount: 0,
      giftPointTotal: 0,
      giftCount: 0,
      maxGiftPoint: 0,
      firstAt: Number.POSITIVE_INFINITY,
      lastAt: Number.NEGATIVE_INFINITY,
      activeBuckets: new Set(),
      timedEvents: [],
      earlyEventCount: 0,
      quietEventCount: 0
    };
    byUser.set(event.userKey, acc);
  } else if (event.displayName && isBetterDisplayName(event.displayName, acc.displayName)) {
    acc.displayName = event.displayName;
  }

  if (event.kind === 'comment') {
    acc.commentCount += event.units;
  } else {
    acc.giftPointTotal += event.points;
    acc.giftCount += event.units;
    if (event.points > acc.maxGiftPoint) acc.maxGiftPoint = event.points;
  }

  if (event.timestamp != null) {
    acc.firstAt = Math.min(acc.firstAt, event.timestamp);
    acc.lastAt = Math.max(acc.lastAt, event.timestamp);
    acc.timedEvents.push(event);
    timedEvents.push(event);
  }
}

/**
 * @param {ContributionEvent[]} timedEvents
 * @param {Required<SupporterContributionOptions> & {weights: SupporterContributionWeights}} options
 * @returns {{
 *   hasTiming: boolean,
 *   startAt: number,
 *   endAt: number,
 *   durationMs: number,
 *   bucketMs: number,
 *   bucketCounts: Map<number, number>,
 *   quietThreshold: number,
 *   earlyCutoff: number,
 *   lateStart: number
 * }}
 */
function buildTimingContext(timedEvents, options) {
  if (!timedEvents.length) {
    return {
      hasTiming: false,
      startAt: 0,
      endAt: 0,
      durationMs: 0,
      bucketMs: options.quietBucketMs,
      bucketCounts: new Map(),
      quietThreshold: 0,
      earlyCutoff: 0,
      lateStart: 0
    };
  }
  let startAt = /** @type {number} */ (timedEvents[0].timestamp);
  let endAt = startAt;
  for (const event of timedEvents) {
    const t = /** @type {number} */ (event.timestamp);
    if (t < startAt) startAt = t;
    if (t > endAt) endAt = t;
  }
  const durationMs = Math.max(0, endAt - startAt);
  const bucketMs = options.quietBucketMs;
  /** @type {Map<number, number>} */
  const bucketCounts = new Map();
  let totalUnits = 0;
  for (const event of timedEvents) {
    const bucket = bucketIndex(/** @type {number} */ (event.timestamp), startAt, bucketMs);
    const units = Math.max(1, event.units);
    totalUnits += units;
    bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + units);
  }
  const bucketSpan = Math.max(1, Math.floor(durationMs / bucketMs) + 1);
  const avg = totalUnits / bucketSpan;
  const quietThreshold = Math.max(1, Math.floor(avg * options.quietBucketRatio));
  const earlyWindow = Math.max(options.earlyWindowMs, durationMs * options.earlyWindowRatio);
  const lateWindow = Math.max(options.lateWindowMs, durationMs * options.lateWindowRatio);
  return {
    hasTiming: true,
    startAt,
    endAt,
    durationMs,
    bucketMs,
    bucketCounts,
    quietThreshold,
    earlyCutoff: startAt + earlyWindow,
    lateStart: Math.max(startAt, endAt - lateWindow)
  };
}

/**
 * @param {Map<string, SupporterAccumulator>} byUser
 * @param {ReturnType<typeof buildTimingContext>} timing
 */
function applyTimingSignals(byUser, timing) {
  if (!timing.hasTiming) return;
  for (const acc of byUser.values()) {
    for (const event of acc.timedEvents) {
      if (event.timestamp == null) continue;
      const bucket = bucketIndex(event.timestamp, timing.startAt, timing.bucketMs);
      acc.activeBuckets.add(bucket);
      if (event.timestamp <= timing.earlyCutoff) {
        acc.earlyEventCount += event.units;
      }
      const bucketCount = timing.bucketCounts.get(bucket) || 0;
      if (bucketCount <= timing.quietThreshold) {
        acc.quietEventCount += event.units;
      }
    }
  }
}

/**
 * @param {SupporterAccumulator} acc
 * @param {ReturnType<typeof buildTimingContext>} timing
 * @param {Required<SupporterContributionOptions> & {weights: SupporterContributionWeights}} options
 * @returns {SupporterContributionResult}
 */
function buildContributionResult(acc, timing, options) {
  const firstAt = Number.isFinite(acc.firstAt) ? acc.firstAt : null;
  const lastAt = Number.isFinite(acc.lastAt) ? acc.lastAt : null;
  const continuityRatio =
    timing.durationMs > 0 && firstAt != null && lastAt != null
      ? clamp01((lastAt - firstAt) / timing.durationMs)
      : 0;
  const commentScore = acc.commentCount * options.weights.commentCount;
  const giftPointScore = acc.giftPointTotal * options.weights.giftPoint;
  const giftCountScore = acc.giftCount * options.weights.giftCount;
  const continuityScore =
    continuityRatio * options.weights.continuityRatio +
    acc.activeBuckets.size * options.weights.activeMinute;
  const earlySupportScore = acc.earlyEventCount * options.weights.earlyEvent;
  const quietSupportScore = acc.quietEventCount * options.weights.quietEvent;
  const mixedSupportBonus =
    acc.commentCount > 0 && acc.giftCount > 0
      ? options.weights.mixedSupportBonus
      : 0;
  const score = roundScore(
    commentScore +
      giftPointScore +
      giftCountScore +
      continuityScore +
      earlySupportScore +
      quietSupportScore +
      mixedSupportBonus
  );
  const breakdown = {
    commentCount: acc.commentCount,
    commentScore: roundScore(commentScore),
    giftPointTotal: acc.giftPointTotal,
    giftPointScore: roundScore(giftPointScore),
    giftCount: acc.giftCount,
    giftCountScore: roundScore(giftCountScore),
    continuityRatio: roundScore(continuityRatio),
    activeMinutes: acc.activeBuckets.size,
    continuityScore: roundScore(continuityScore),
    earlyEventCount: acc.earlyEventCount,
    earlySupportScore: roundScore(earlySupportScore),
    quietEventCount: acc.quietEventCount,
    quietSupportScore: roundScore(quietSupportScore),
    mixedSupportBonus: roundScore(mixedSupportBonus),
    firstAt,
    lastAt,
    isAnonymous: acc.isAnonymous
  };
  return {
    userKey: acc.userKey,
    displayName: acc.displayName || fallbackDisplayName(acc.userKey),
    score,
    breakdown,
    rank: 0,
    highlights: buildHighlights(acc, breakdown, timing, options)
  };
}

/**
 * @param {SupporterAccumulator} acc
 * @param {SupporterContributionBreakdown} breakdown
 * @param {ReturnType<typeof buildTimingContext>} timing
 * @param {Required<SupporterContributionOptions> & {weights: SupporterContributionWeights}} options
 * @returns {string[]}
 */
function buildHighlights(acc, breakdown, timing, options) {
  /** @type {string[]} */
  const highlights = [];
  if (breakdown.quietEventCount >= 2) {
    highlights.push(
      `過疎時間帯に${breakdown.quietEventCount}回応援して、場を支えました`
    );
  }
  if (
    timing.durationMs >= options.minDurationForContinuityMs &&
    breakdown.firstAt != null &&
    breakdown.lastAt != null &&
    breakdown.firstAt <= timing.earlyCutoff &&
    breakdown.lastAt >= timing.lateStart &&
    breakdown.continuityRatio >= options.continuityHighlightRatio
  ) {
    highlights.push('初コメから最後まで近く、長く伴走していました');
  }
  if (breakdown.giftPointTotal >= options.highGiftPointThreshold) {
    highlights.push(`高額ギフトで大きく支えました（合計${breakdown.giftPointTotal}pt）`);
  }
  if (breakdown.commentCount >= options.heavyCommentThreshold) {
    highlights.push(`コメント${breakdown.commentCount}件で流れを作りました`);
  }
  if (breakdown.earlyEventCount >= 2) {
    highlights.push('序盤から応援を始めて、配信の立ち上がりを支えました');
  }
  if (acc.isAnonymous && breakdown.commentCount + breakdown.giftCount >= 2) {
    highlights.push('匿名の応援も、たぬ姉レーンの視点で見逃さず拾います');
  }
  if (!highlights.length) {
    if (breakdown.giftPointTotal > 0) {
      highlights.push(`ギフト${breakdown.giftCount}回で応援を届けました`);
    } else {
      highlights.push(`コメント${breakdown.commentCount}件で応援を届けました`);
    }
  }
  return highlights;
}

/**
 * @param {SupporterContributionResult} a
 * @param {SupporterContributionResult} b
 * @returns {number}
 */
function compareContributionResults(a, b) {
  return (
    b.score - a.score ||
    b.breakdown.giftPointTotal - a.breakdown.giftPointTotal ||
    b.breakdown.giftCount - a.breakdown.giftCount ||
    b.breakdown.commentCount - a.breakdown.commentCount ||
    a.userKey.localeCompare(b.userKey, 'ja')
  );
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function resolveCommentUserKey(row) {
  const explicit = firstText(row, ['userKey', 'userId', 'rawUserId', 'uid', 'user_id']);
  if (explicit) return explicit;
  const displayName = firstText(row, ['nickname', 'displayName', 'name']);
  if (displayName) return `__anon_name_${displayName}`;
  const commentNo = firstText(row, ['commentNo', 'no', 'id']);
  if (commentNo) return `__anon_comment_${commentNo}`;
  return '';
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} displayName
 * @returns {string}
 */
function resolveGiftUserKey(row, displayName) {
  const explicit = firstText(row, [
    'userKey',
    'userId',
    'senderUserId',
    'advertiserUserId',
    'uid'
  ]);
  if (explicit) return explicit;
  if (displayName) return `__anon_${displayName}`;
  return '';
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} userKey
 * @returns {string}
 */
function resolveDisplayName(row, userKey) {
  return (
    firstText(row, ['nickname', 'displayName', 'name', 'senderName']) ||
    fallbackDisplayName(userKey)
  );
}

/**
 * @param {string} userKey
 * @returns {string}
 */
function fallbackDisplayName(userKey) {
  return isAnonymousUserKey(userKey) ? '匿名応援者' : userKey;
}

/**
 * @param {string} userKey
 * @returns {boolean}
 */
function isAnonymousUserKey(userKey) {
  const key = String(userKey || '').trim().toLowerCase();
  return (
    key.startsWith('a:') ||
    key.startsWith('anon:') ||
    key.startsWith('__anon') ||
    key.includes('184')
  );
}

/**
 * @param {string} next
 * @param {string} current
 * @returns {boolean}
 */
function isBetterDisplayName(next, current) {
  if (!next) return false;
  if (!current) return true;
  if (current === '匿名応援者' && next !== current) return true;
  return next.length > current.length && current === next.slice(0, current.length);
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} keys
 * @returns {string}
 */
function firstText(row, keys) {
  for (const key of keys) {
    const value = row[key];
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function timestampOrNull(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function nonNegativeNumberOr(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  return fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveIntegerOr(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveNumberOr(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function ratioOr(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return fallback;
}

/**
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * @param {number} timestamp
 * @param {number} startAt
 * @param {number} bucketMs
 * @returns {number}
 */
function bucketIndex(timestamp, startAt, bucketMs) {
  return Math.max(0, Math.floor((timestamp - startAt) / bucketMs));
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundScore(value) {
  return Math.round(value * 100) / 100;
}
