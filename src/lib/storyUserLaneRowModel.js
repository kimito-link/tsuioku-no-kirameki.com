/**
 * 応援ユーザーレーン: 1 ユーザー候補あたりの tier・サムネ・ソート用スコアを一箇所で組み立てる。
 *
 * NOTE (Phase 1.5 bridge):
 *   tier 決定の正本は `src/domain/lane/tier.js` の `resolveLaneTier` に移った。
 *   ここはその呼び出しに差し替えた transitional shim で、旧シグネチャ
 *   `userLaneProfileCompletenessTier(entry, httpAvatarCandidate)` を保ったまま
 *   実装だけ差し替える（Parallel Change）。
 *
 *   旧ルールから挙動が変わる点は 1 つだけ:
 *     - **非匿名 + 強い表示名のみ（avatarObserved なし・URL なし）→ link(3)**
 *       旧ルールでは konta(2) に落ちていて、ニコ生の大多数の個人タイルが
 *       りんく段に上がれないという退行を招いていた（docs/lane-architecture-redesign.md §1.3）。
 *
 *   hasPersonalThumb（URL score>=2）の信号は `explainSupportGridDisplayTier`
 *   から引き続き受け取り、`hasNonCanonicalPersonalUrl` として新 policy に渡す。
 */

import { explainSupportGridDisplayTier } from './supportGridDisplayTier.js';
import { userLaneResolvedThumbScore } from './supportGrowthTileSrc.js';
import {
  pickStoryUserLaneCellDisplaySrc,
  userLaneHttpForTilePick
} from './storyUserLaneDisplaySrc.js';
import { resolveLaneTier } from '../domain/lane/tier.js';

/**
 * 応援ユーザーレーンの並び順。大きいほど「個人サムネ＋表示名」に近い。
 * 実体は `resolveLaneTier` に委譲する。
 *
 * @param {{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: boolean }|null|undefined} entry
 * @param {string} httpAvatarCandidate storyGrowth と stored をマージした `userLaneHttpForTilePick` 結果推奨
 * @returns {0|1|2|3}
 */
export function userLaneProfileCompletenessTier(entry, httpAvatarCandidate) {
  const uid = String(entry?.userId || '').trim();
  if (!uid) return 0;
  const nickname = String(entry?.nickname || '').trim();
  const observed = Boolean(entry?.avatarObserved);
  // 非合成の個人 URL 判定は URL スコアリングに引き続き任せる（score>=2）
  const ex = explainSupportGridDisplayTier({
    userId: uid,
    nickname,
    httpAvatarCandidate: String(httpAvatarCandidate ?? '').trim(),
    storedAvatarUrl: String(entry?.avatarUrl || '').trim(),
    avatarObserved: observed
  });
  return resolveLaneTier({
    userId: uid,
    nickname,
    avatarObserved: observed,
    hasNonCanonicalPersonalUrl: Boolean(ex.hasPersonalThumb)
  });
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
