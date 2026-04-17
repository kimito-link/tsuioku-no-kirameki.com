/**
 * 応援ユーザーレーン: 1 ユーザー候補あたりの tier・サムネ・ソート用スコアを一箇所で組み立てる。
 */

import { explainSupportGridDisplayTier } from './supportGridDisplayTier.js';
import {
  isAnonymousStyleNicoUserId,
  userLaneResolvedThumbScore
} from './supportGrowthTileSrc.js';
import {
  pickStoryUserLaneCellDisplaySrc,
  userLaneHttpForTilePick
} from './storyUserLaneDisplaySrc.js';

/**
 * 応援ユーザーレーンの並び順。大きいほど「個人サムネ＋表示名」に近い。
 *
 * レーン専用ルール（supportGrid より厳格、匿名は一切上段に上げない）:
 * - link(3):  非匿名 + 個人サムネあり
 * - konta(2): 非匿名 + 個人サムネなし + 強い表示名あり
 * - tanu(1):  それ以外（匿名 a:xxxx などはカスタム表示名や個人サムネがあっても全部ここ）
 *
 * 旧実装はこの関数の中で
 *   - 「非匿名 + 強い表示名 + 個人サムネなし」を link に格上げしていた
 *   - 「匿名 + 強い表示名 / 匿名 + 個人サムネ」を konta に混入させていた
 * ため、こん太段の候補がほぼ枯れて「こん太列が出ない」状態になり、
 * かつスクリーンショットのように a:xxxx 匿名がこん太段に紛れていた。
 *
 * @param {{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: boolean }|null|undefined} entry
 * @param {string} httpAvatarCandidate storyGrowth と stored をマージした `userLaneHttpForTilePick` 結果推奨（表示セルと段を一致させる）
 * @returns {0|1|2|3}
 */
export function userLaneProfileCompletenessTier(entry, httpAvatarCandidate) {
  const uid = String(entry?.userId || '').trim();
  if (!uid) return 0;
  // 匿名 (a:xxxx, ハッシュ風 ID 等) は強ニック・個人サムネがあっても上段には出さず、
  // 必ず たぬ姉(1) に落とす。レーン専用の厳格ルール。
  if (isAnonymousStyleNicoUserId(uid)) return 1;
  const ex = explainSupportGridDisplayTier({
    userId: uid,
    nickname: String(entry?.nickname || '').trim(),
    httpAvatarCandidate: String(httpAvatarCandidate ?? '').trim(),
    storedAvatarUrl: String(entry?.avatarUrl || '').trim(),
    avatarObserved: Boolean(entry?.avatarObserved)
  });
  if (ex.hasPersonalThumb) return 3;
  if (ex.strongNick) return 2;
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
