/**
 * マーケ分析・HTMLレポート先頭 KPI: ギフト投げ主・広告した人の人数。
 */

import { isAnonymousStyleNicoUserId } from '../domain/user/identity.js';
import { parseNicoadCommentText } from './parseGiftComment.js';
import { buildGiftThrowerLaneEntries } from './userLaneMergeGiftThrowers.js';
import { computeCommentParticipationPct } from './audienceEngagementGap.js';

/**
 * @param {unknown} uid
 * @returns {boolean}
 */
function isNumericUserId(uid) {
  return /^\d{5,14}$/.test(String(uid || '').trim());
}

/**
 * @param {readonly { userId?: unknown }[]|null|undefined} giftUsers
 * @param {readonly { userId?: unknown }[]|null|undefined} [giftEvents]
 * @param {readonly { userId?: unknown }[]|null|undefined} [giftHistoryThrows]
 * @returns {number}
 */
export function countUniqueGiftThrowers(giftUsers, giftEvents, giftHistoryThrows) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const row of buildGiftThrowerLaneEntries(giftUsers, {})) {
    if (row.userId) keys.add(row.userId);
  }
  for (const list of [giftEvents, giftHistoryThrows]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const uid = String(raw?.userId || '').trim();
      if (isNumericUserId(uid)) keys.add(uid);
    }
  }
  return keys.size;
}

/**
 * @param {readonly { userId?: unknown, nickname?: unknown, name?: unknown, contribution?: unknown, score?: unknown }[]|null|undefined} adContributionRanking
 * @param {readonly { text?: unknown }[]|null|undefined} [comments]
 * @returns {number}
 */
export function countUniqueAdContributors(adContributionRanking, comments) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const raw of Array.isArray(adContributionRanking) ? adContributionRanking : []) {
    const uid = String(raw?.userId || '').trim();
    const contribution = Math.max(
      Number(raw?.contribution) || 0,
      Number(raw?.score) || 0
    );
    if (!Number.isFinite(contribution) || contribution <= 0) continue;
    if (uid && !isAnonymousStyleNicoUserId(uid)) {
      keys.add(isNumericUserId(uid) ? `uid:${uid}` : `id:${uid}`);
      continue;
    }
    const name = String(raw?.nickname ?? raw?.name ?? '').trim();
    if (name) keys.add(`name:${name}`);
  }
  if (keys.size > 0) return keys.size;

  for (const c of Array.isArray(comments) ? comments : []) {
    const parsed = parseNicoadCommentText(String(c?.text ?? '').trim());
    if (!parsed?.sender) continue;
    keys.add(`nicoad:${parsed.sender}`);
  }
  return keys.size;
}

/**
 * @param {{
 *   giftUsers?: readonly unknown[],
 *   giftEvents?: readonly unknown[],
 *   giftHistoryThrows?: readonly unknown[],
 *   adContributionRanking?: readonly unknown[],
 *   comments?: readonly unknown[]
 * }} input
 * @returns {{
 *   uniqueGiftThrowers: number,
 *   uniqueAdContributors: number,
 *   giftParticipationPct: number,
 *   adParticipationPct: number
 * }}
 */
export function resolveMarketingSupportParticipationCounts(input = {}) {
  const uniqueGiftThrowers = countUniqueGiftThrowers(
    input.giftUsers,
    input.giftEvents,
    input.giftHistoryThrows
  );
  const uniqueAdContributors = countUniqueAdContributors(
    input.adContributionRanking,
    input.comments
  );
  return {
    uniqueGiftThrowers,
    uniqueAdContributors,
    giftParticipationPct: 0,
    adParticipationPct: 0
  };
}

/**
 * @param {import('./audienceEngagementGap.js').AudienceEngagementGap} gap
 * @param {ReturnType<typeof resolveMarketingSupportParticipationCounts>} support
 * @returns {{ giftParticipationPct: number, adParticipationPct: number }}
 */
export function supportParticipationPctAgainstVisitors(gap, support) {
  const visitors = Number(gap?.totalVisitors) || 0;
  if (visitors <= 0) {
    return { giftParticipationPct: 0, adParticipationPct: 0 };
  }
  return {
    giftParticipationPct: computeCommentParticipationPct(
      support.uniqueGiftThrowers,
      visitors
    ),
    adParticipationPct: computeCommentParticipationPct(
      support.uniqueAdContributors,
      visitors
    )
  };
}
