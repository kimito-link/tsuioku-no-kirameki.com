/**
 * 応援ユーザーレーン: 1 ユーザー候補あたりの tier・サムネ・ソート用スコアを一箇所で組み立てる。
 */

import {
  explainSupportGridDisplayTier,
  SUPPORT_GRID_TIER_KONTA,
  SUPPORT_GRID_TIER_LINK
} from './supportGridDisplayTier.js';
import {
  isAnonymousStyleNicoUserId,
  userLaneResolvedThumbScore
} from './supportGrowthTileSrc.js';
import {
  pickStoryUserLaneCellDisplaySrc,
  userLaneHttpForTilePick
} from './storyUserLaneDisplaySrc.js';
import { isNiconicoAnonymousUserId } from './nicoAnonymousDisplay.js';

/**
 * 応援ユーザーレーンの並び順。大きいほど「個人サムネ＋表示名」に近い。
 * レーン専用ルール:
 * - link(3): 個人サムネあり
 * - konta(2): 個人サムネなし + 強い表示名あり（a: 匿名 ID はここに載せず 1 へ）
 * - tanu(1): それ以外
 * @param {{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: boolean }|null|undefined} entry
 * @param {string} httpAvatarCandidate storyGrowth と stored をマージした `userLaneHttpForTilePick` 結果推奨（表示セルと段を一致させる）
 * @returns {0|1|2|3}
 */
export function userLaneProfileCompletenessTier(entry, httpAvatarCandidate) {
  const uid = String(entry?.userId || '').trim();
  if (!uid) return 0;
  const ex = explainSupportGridDisplayTier({
    userId: uid,
    nickname: String(entry?.nickname || '').trim(),
    httpAvatarCandidate: String(httpAvatarCandidate ?? '').trim(),
    storedAvatarUrl: String(entry?.avatarUrl || '').trim(),
    avatarObserved: Boolean(entry?.avatarObserved)
  });
  /** レーンは supportGrid より厳格にし、混入を抑える */
  let t = 'tanu';
  if (ex.hasPersonalThumb) {
    const anon = isAnonymousStyleNicoUserId(uid);
    t = anon && !ex.strongNick ? SUPPORT_GRID_TIER_KONTA : SUPPORT_GRID_TIER_LINK;
  } else if (ex.strongNick && !isAnonymousStyleNicoUserId(uid)) {
    t = SUPPORT_GRID_TIER_LINK;
  } else if (ex.strongNick) {
    t = SUPPORT_GRID_TIER_KONTA;
  }
  /** @type {1|2|3} */
  let n;
  if (t === SUPPORT_GRID_TIER_LINK) n = 3;
  else if (t === SUPPORT_GRID_TIER_KONTA) n = 2;
  else n = 1;
  if (isNiconicoAnonymousUserId(uid) && n === 2) return 1;
  return n;
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
  const profileTier = userLaneProfileCompletenessTier(entry, httpForLane);
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
