/**
 * popup 再描画時の応援演出ガード（純関数）。
 * 軽量 paint → heavy 全件 paint の二段階で、コメント件数マイルストーンが誤爆しないよう判定する。
 */

/** この件数差以上でプライム済み high-water を「未完了の軽量読み」とみなし再プライムする */
export const COMMENT_MILESTONE_REPRIME_MIN_JUMP = 100;

/**
 * @param {boolean} heavyCommentsPending heavy 全件読みが未完了
 * @returns {boolean}
 */
export function shouldDeferCelebrationsUntilHeavySettled(heavyCommentsPending) {
  return heavyCommentsPending === true;
}

/**
 * @param {{
 *   primedLiveId: string,
 *   liveId: string,
 *   prevHighWater: number|null,
 *   newCount: number
 * }} state
 * @returns {boolean}
 */
export function shouldReprimeCommentMilestones(state) {
  const lid = String(state.liveId || '').trim().toLowerCase();
  const primed = String(state.primedLiveId || '').trim().toLowerCase();
  if (!primed || primed !== lid) return false;
  const prev = state.prevHighWater;
  const next = state.newCount;
  if (prev == null || !Number.isFinite(next) || next < 0) return false;
  return next > prev + COMMENT_MILESTONE_REPRIME_MIN_JUMP;
}
