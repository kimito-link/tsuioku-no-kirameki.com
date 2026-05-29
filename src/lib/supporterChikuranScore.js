/**
 * 「応援者ちくらん β」用のローカル集計コア。
 *
 * 既存 storage のコメント・ギフト・公式ランキング行を入力にして、
 * 応援している人を主役にしたランキング候補を作る純関数。
 * chrome.storage / DOM / network には触れない。
 */

export const SUPPORTER_CHIKURAN_ANONYMOUS_KEY = '__supporter_chikuran_anonymous__';

export const SUPPORTER_CHIKURAN_DEFAULT_WEIGHTS = Object.freeze({
  comment: 2,
  recent5mComment: 8,
  recent15mComment: 4,
  giftThrow: 16,
  giftPointPer100: 10,
  adPointPer100: 6,
  activeDay: 3,
  newcomerMomentum: 6
});

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const NEWCOMER_WINDOW_MS = 30 * 60 * 1000;

/**
 * @typedef {{
 *   liveId?: string,
 *   comments?: readonly unknown[],
 *   giftUsers?: readonly unknown[],
 *   giftEvents?: readonly unknown[],
 *   giftContributionRanking?: readonly unknown[],
 *   adContributionRanking?: readonly unknown[]
 * }} SupporterChikuranInput
 *
 * @typedef {{
 *   liveId?: string,
 *   nowMs?: number,
 *   maxRows?: number,
 *   foldAnonymous?: boolean,
 *   excludeUserIds?: readonly string[],
 *   weights?: Partial<typeof SUPPORTER_CHIKURAN_DEFAULT_WEIGHTS>
 * }} SupporterChikuranOptions
 *
 * @typedef {{
 *   supporterKey: string,
 *   identityKind: 'userId' | 'name' | 'anonymous',
 *   displayName: string,
 *   userId: string,
 *   avatarUrl: string,
 *   isAnonymousAggregate: boolean,
 *   commentCount: number,
 *   recent5mCommentCount: number,
 *   recent15mCommentCount: number,
 *   giftThrowCount: number,
 *   giftPointTotal: number,
 *   adPointTotal: number,
 *   activeDayCount: number,
 *   firstSeenAt: number,
 *   lastSeenAt: number,
 *   totalScore: number,
 *   sources: string[]
 * }} SupporterChikuranRow
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanString(value) {
  return String(value == null ? '' : value).trim();
}

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
 * liveId が明示されていて、行側にも liveId がある場合だけ絞る。
 * giftUsers など per-live storage 由来の配列は行に liveId が無いことがあるため、その場合は採用する。
 *
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
 * @param {unknown} value
 * @returns {string}
 */
function extractUidFromUserPageUrl(value) {
  const s = cleanString(value);
  const m = s.match(/^https:\/\/www\.nicovideo\.jp\/user\/(\d{1,18})\/?$/i);
  return m ? m[1] : '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const s = cleanString(value);
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * @param {string} uid
 * @param {string} name
 * @param {unknown} raw
 * @returns {boolean}
 */
function isAnonymousSupporter(uid, name, raw) {
  const lower = uid.toLowerCase();
  const row = /** @type {{ is184?: unknown, isAnonymous?: unknown }} */ (raw || {});
  if (row.is184 === true || row.isAnonymous === true) return true;
  if (!uid && (!name || /^(名無し|匿名|anonymous)$/i.test(name))) return true;
  if (lower.startsWith('a:')) return true;
  if (lower.startsWith('__anon_')) return true;
  if (lower.startsWith('__gift_sender_')) return true;
  return false;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function dayKey(value) {
  const at = positiveTimestamp(value);
  if (!at) return '';
  try {
    return new Date(at).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function pickRankingName(raw) {
  const row = /** @type {Record<string, unknown>} */ (raw || {});
  return (
    cleanString(row.name) ||
    cleanString(row.supporterName) ||
    cleanString(row.advertiserName) ||
    cleanString(row.nickname) ||
    cleanString(row.thumbnailAltName)
  );
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
function pickRankingContribution(raw) {
  const row = /** @type {Record<string, unknown>} */ (raw || {});
  return (
    nonNegativeNumber(row.contribution) ||
    nonNegativeNumber(row.totalContribution) ||
    nonNegativeNumber(row.totalPoints) ||
    nonNegativeNumber(row.point)
  );
}

/**
 * @param {unknown} raw
 * @returns {{ uid: string, name: string, avatarUrl: string, anonymous: boolean }}
 */
function identifyCommentLike(raw) {
  const row = /** @type {Record<string, unknown>} */ (raw || {});
  const uid = cleanString(row.userId ?? row.user_id);
  const name = cleanString(row.nickname ?? row.name);
  return {
    uid,
    name,
    avatarUrl: sanitizeHttpUrl(row.avatarUrl ?? row.thumbnailUrl),
    anonymous: isAnonymousSupporter(uid, name, raw)
  };
}

/**
 * @param {unknown} raw
 * @returns {{ uid: string, name: string, avatarUrl: string, anonymous: boolean }}
 */
function identifyOfficialRanking(raw) {
  const row = /** @type {Record<string, unknown>} */ (raw || {});
  const uid =
    extractUidFromUserPageUrl(row.userPageUrl) ||
    cleanString(row.userId ?? row.supporterId ?? row.advertiserId);
  const name = pickRankingName(row);
  return {
    uid,
    name,
    avatarUrl: sanitizeHttpUrl(row.thumbnailUrl ?? row.avatarUrl),
    anonymous: isAnonymousSupporter(uid, name, raw)
  };
}

/**
 * @param {{ uid: string, name: string, anonymous: boolean }} id
 * @param {boolean} foldAnonymous
 * @returns {{ key: string, identityKind: 'userId' | 'name' | 'anonymous' }}
 */
function supporterKeyFor(id, foldAnonymous) {
  if (id.anonymous && foldAnonymous) {
    return { key: SUPPORTER_CHIKURAN_ANONYMOUS_KEY, identityKind: 'anonymous' };
  }
  if (id.uid && !id.anonymous) {
    return { key: `u:${id.uid}`, identityKind: 'userId' };
  }
  if (id.name && !id.anonymous) {
    return { key: `n:${id.name.toLowerCase()}`, identityKind: 'name' };
  }
  return { key: SUPPORTER_CHIKURAN_ANONYMOUS_KEY, identityKind: 'anonymous' };
}

/**
 * @param {ReturnType<typeof createEmptyAggregate>} agg
 * @param {{ uid?: string, name?: string, avatarUrl?: string, at?: number, source: string }} p
 */
function touchAggregate(agg, p) {
  const at = positiveTimestamp(p.at);
  if (p.uid && !agg.userId) agg.userId = p.uid;
  if (p.avatarUrl && !agg.avatarUrl) agg.avatarUrl = p.avatarUrl;
  if (p.name && (!agg.displayName || at >= agg.lastSeenAt)) {
    agg.displayName = p.name;
  }
  if (at > 0) {
    if (!agg.firstSeenAt || at < agg.firstSeenAt) agg.firstSeenAt = at;
    if (at > agg.lastSeenAt) agg.lastSeenAt = at;
    const day = dayKey(at);
    if (day) agg.activeDays.add(day);
  }
  agg.sources.add(p.source);
}

function createEmptyAggregate(/** @type {string} */ key, /** @type {'userId' | 'name' | 'anonymous'} */ identityKind) {
  return {
    supporterKey: key,
    identityKind,
    displayName: identityKind === 'anonymous' ? '匿名応援' : '',
    userId: '',
    avatarUrl: '',
    commentCount: 0,
    recent5mCommentCount: 0,
    recent15mCommentCount: 0,
    giftThrowCountFromUsers: 0,
    giftEventCount: 0,
    observedGiftPointTotal: 0,
    officialGiftContribution: 0,
    adPointTotal: 0,
    firstSeenAt: 0,
    lastSeenAt: 0,
    activeDays: new Set(),
    sources: new Set()
  };
}

/**
 * @param {Map<string, ReturnType<typeof createEmptyAggregate>>} map
 * @param {{ uid: string, name: string, avatarUrl: string, anonymous: boolean }} id
 * @param {boolean} foldAnonymous
 * @returns {ReturnType<typeof createEmptyAggregate>}
 */
function getAggregate(map, id, foldAnonymous) {
  const { key, identityKind } = supporterKeyFor(id, foldAnonymous);
  let agg = map.get(key);
  if (!agg) {
    agg = createEmptyAggregate(key, identityKind);
    map.set(key, agg);
  }
  if (identityKind === 'anonymous') {
    agg.displayName = '匿名応援';
  }
  return agg;
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundScore(value) {
  return Math.round(value * 10) / 10;
}

/**
 * @param {ReturnType<typeof createEmptyAggregate>} agg
 * @param {typeof SUPPORTER_CHIKURAN_DEFAULT_WEIGHTS} weights
 * @param {number} nowMs
 * @returns {SupporterChikuranRow}
 */
function aggregateToRow(agg, weights, nowMs) {
  const giftThrowCount = Math.max(agg.giftThrowCountFromUsers, agg.giftEventCount);
  const giftPointTotal = Math.max(
    Math.round(agg.observedGiftPointTotal),
    Math.round(agg.officialGiftContribution)
  );
  const activeDayCount = agg.activeDays.size;
  const hasNewcomerMomentum =
    agg.firstSeenAt > 0 &&
    nowMs - agg.firstSeenAt <= NEWCOMER_WINDOW_MS &&
    (agg.recent15mCommentCount > 0 || giftThrowCount > 0);
  const totalScore = roundScore(
    agg.commentCount * weights.comment +
      agg.recent5mCommentCount * weights.recent5mComment +
      agg.recent15mCommentCount * weights.recent15mComment +
      giftThrowCount * weights.giftThrow +
      (giftPointTotal / 100) * weights.giftPointPer100 +
      (agg.adPointTotal / 100) * weights.adPointPer100 +
      activeDayCount * weights.activeDay +
      (hasNewcomerMomentum ? weights.newcomerMomentum : 0)
  );
  const isAnonymousAggregate = agg.identityKind === 'anonymous';
  return {
    supporterKey: agg.supporterKey,
    identityKind: agg.identityKind,
    displayName: isAnonymousAggregate
      ? '匿名応援'
      : agg.displayName || (agg.userId ? `u/${agg.userId}` : '応援者'),
    userId: isAnonymousAggregate ? '' : agg.userId,
    avatarUrl: isAnonymousAggregate ? '' : agg.avatarUrl,
    isAnonymousAggregate,
    commentCount: agg.commentCount,
    recent5mCommentCount: agg.recent5mCommentCount,
    recent15mCommentCount: agg.recent15mCommentCount,
    giftThrowCount,
    giftPointTotal,
    adPointTotal: Math.round(agg.adPointTotal),
    activeDayCount,
    firstSeenAt: agg.firstSeenAt,
    lastSeenAt: agg.lastSeenAt,
    totalScore,
    sources: [...agg.sources].sort()
  };
}

/**
 * コメント・ギフト・貢献度・広告をローカルだけで合算し、応援者ランキング候補を返す。
 *
 * 匿名 / 184 / 名無しは既定で 1 つの「匿名応援」バケットにまとめる。
 * 個別の匿名 ID や名無し名をランキング化しないための既定値。
 *
 * @param {SupporterChikuranInput} input
 * @param {SupporterChikuranOptions} [options]
 * @returns {{ generatedAt: number, liveId: string, rows: SupporterChikuranRow[], totals: { supporterCount: number, anonymousIncluded: boolean } }}
 */
export function buildSupporterChikuranRows(input, options = {}) {
  const nowMs = positiveTimestamp(options.nowMs) || Date.now();
  const maxRows = Math.max(1, Math.min(100, Math.trunc(Number(options.maxRows) || 20)));
  const foldAnonymous = options.foldAnonymous !== false;
  const liveId = normalizeLiveId(options.liveId) || normalizeLiveId(input?.liveId);
  const excluded = new Set((options.excludeUserIds || []).map((v) => cleanString(v)).filter(Boolean));
  const weights = Object.freeze({
    ...SUPPORTER_CHIKURAN_DEFAULT_WEIGHTS,
    ...(options.weights || {})
  });

  /** @type {Map<string, ReturnType<typeof createEmptyAggregate>>} */
  const map = new Map();

  for (const raw of input?.comments || []) {
    if (!rowMatchesLive(raw, liveId)) continue;
    const id = identifyCommentLike(raw);
    if (id.uid && excluded.has(id.uid)) continue;
    const at = positiveTimestamp(/** @type {{ capturedAt?: unknown }} */ (raw || {}).capturedAt);
    const agg = getAggregate(map, id, foldAnonymous);
    agg.commentCount += 1;
    if (at > 0 && nowMs - at <= FIVE_MINUTES_MS) agg.recent5mCommentCount += 1;
    if (at > 0 && nowMs - at <= FIFTEEN_MINUTES_MS) agg.recent15mCommentCount += 1;
    touchAggregate(agg, { uid: id.uid, name: id.name, avatarUrl: id.avatarUrl, at, source: 'comment' });
  }

  for (const raw of input?.giftUsers || []) {
    if (!rowMatchesLive(raw, liveId)) continue;
    const id = identifyCommentLike(raw);
    if (id.uid && excluded.has(id.uid)) continue;
    const at = positiveTimestamp(/** @type {{ capturedAt?: unknown }} */ (raw || {}).capturedAt);
    const throwCount = Math.max(
      1,
      Math.trunc(nonNegativeNumber(/** @type {{ throwCount?: unknown }} */ (raw || {}).throwCount) || 1)
    );
    const agg = getAggregate(map, id, foldAnonymous);
    agg.giftThrowCountFromUsers += throwCount;
    touchAggregate(agg, { uid: id.uid, name: id.name, avatarUrl: id.avatarUrl, at, source: 'gift-users' });
  }

  for (const raw of input?.giftEvents || []) {
    if (!rowMatchesLive(raw, liveId)) continue;
    const id = identifyCommentLike(raw);
    if (id.uid && excluded.has(id.uid)) continue;
    const row = /** @type {{ capturedAt?: unknown, point?: unknown }} */ (raw || {});
    const at = positiveTimestamp(row.capturedAt);
    const point = nonNegativeNumber(row.point);
    const agg = getAggregate(map, id, foldAnonymous);
    agg.giftEventCount += 1;
    agg.observedGiftPointTotal += point;
    touchAggregate(agg, { uid: id.uid, name: id.name, avatarUrl: id.avatarUrl, at, source: 'gift-events' });
  }

  for (const raw of input?.giftContributionRanking || []) {
    const id = identifyOfficialRanking(raw);
    if (id.uid && excluded.has(id.uid)) continue;
    const agg = getAggregate(map, id, foldAnonymous);
    agg.officialGiftContribution = Math.max(agg.officialGiftContribution, pickRankingContribution(raw));
    touchAggregate(agg, {
      uid: id.uid,
      name: id.name,
      avatarUrl: id.avatarUrl,
      at: nowMs,
      source: 'gift-contribution'
    });
  }

  for (const raw of input?.adContributionRanking || []) {
    const id = identifyOfficialRanking(raw);
    if (id.uid && excluded.has(id.uid)) continue;
    const agg = getAggregate(map, id, foldAnonymous);
    agg.adPointTotal += pickRankingContribution(raw);
    touchAggregate(agg, {
      uid: id.uid,
      name: id.name,
      avatarUrl: id.avatarUrl,
      at: nowMs,
      source: 'ad-contribution'
    });
  }

  const rows = [...map.values()]
    .map((agg) => aggregateToRow(agg, weights, nowMs))
    .filter((row) => row.totalScore > 0)
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
      return a.supporterKey.localeCompare(b.supporterKey);
    })
    .slice(0, maxRows);

  return {
    generatedAt: nowMs,
    liveId,
    rows,
    totals: {
      supporterCount: rows.length,
      anonymousIncluded: rows.some((row) => row.isAnonymousAggregate)
    }
  };
}
