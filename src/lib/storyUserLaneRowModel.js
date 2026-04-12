/**
 * 応援ユーザーレーン: 1 ユーザー候補あたりの tier・サムネ・ソート用スコアを一箇所で組み立てる。
 */

import {
  SUPPORT_GRID_TIER_KONTA,
  SUPPORT_GRID_TIER_RINK,
  supportGridDisplayTier
} from './supportGridDisplayTier.js';
import {
  pickStoryUserLaneCellDisplaySrc,
  userLaneHttpForTilePick
} from './storyUserLaneDisplaySrc.js';
import { userLaneResolvedThumbScore } from './supportGrowthTileSrc.js';

/**
 * 応援ユーザーレーンの並び順。大きいほど「個人サムネ＋強い表示名」に近い（supportGridDisplayTier と一致）。
 * @param {{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: boolean }|null|undefined} entry
 * @param {string} httpAvatarCandidate storyGrowth と stored をマージした `userLaneHttpForTilePick` 結果推奨（表示セルと段を一致させる）
 * @returns {0|1|2|3}
 */
export function userLaneProfileCompletenessTier(entry, httpAvatarCandidate) {
  const uid = String(entry?.userId || '').trim();
  if (!uid) return 0;
  const nick = String(entry?.nickname || '').trim();
  const rawAv = String(entry?.avatarUrl || '').trim();
  const t = supportGridDisplayTier({
    userId: uid,
    nickname: nick,
    httpAvatarCandidate: String(httpAvatarCandidate ?? '').trim(),
    storedAvatarUrl: rawAv,
    avatarObserved: Boolean(entry?.avatarObserved)
  });
  if (t === SUPPORT_GRID_TIER_RINK) return 3;
  if (t === SUPPORT_GRID_TIER_KONTA) return 2;
  return 1;
}

/**
 * @typedef {{
 *   yukkuriSrc: string,
 *   tvSrc: string,
 *   anonymousIdenticonEnabled: boolean,
 *   anonymousIdenticonDataUrl?: string
 * }} StoryUserLanePickContext
 */

/**
 * @param {{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown }|null|undefined} entry
 * @param {number} entryIndex
 * @param {string} httpFromGrowth storyGrowthAvatarSrcCandidate
 * @param {StoryUserLanePickContext} pickCtx
 * @returns {{ entryIndex: number, profileTier: number, thumbScore: number, displaySrc: string, httpForLane: string, entry: Record<string, unknown> } | null}
 */
export function buildStoryUserLaneCandidateRow(
  entry,
  entryIndex,
  httpFromGrowth,
  pickCtx
) {
  const uidRaw = String(entry?.userId || '').trim();
  if (!uidRaw) return null;
  const rawAvStored = String(entry?.avatarUrl || '').trim();
  const httpTrim = String(httpFromGrowth ?? '').trim();
  const httpForLane = userLaneHttpForTilePick(uidRaw, httpTrim, rawAvStored);
  const profileTier = userLaneProfileCompletenessTier(entry, rawAvStored);
  const displaySrc = pickStoryUserLaneCellDisplaySrc({
    userId: entry?.userId,
    httpCandidate: httpForLane,
    profileTier,
    yukkuriSrc: pickCtx.yukkuriSrc,
    tvSrc: pickCtx.tvSrc,
    identiconOpts: {
      anonymousIdenticonEnabled: pickCtx.anonymousIdenticonEnabled,
      anonymousIdenticonDataUrl: String(pickCtx.anonymousIdenticonDataUrl ?? '')
    }
  });
  if (!displaySrc) return null;
  const thumbScore = userLaneResolvedThumbScore(entry?.userId, httpForLane);
  return {
    entryIndex,
    profileTier,
    thumbScore,
    displaySrc,
    httpForLane,
    entry
  };
}
