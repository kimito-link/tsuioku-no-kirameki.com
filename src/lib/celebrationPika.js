/**
 * パチンコ／ボカロ MV 風 — 画面全体「ぴかっ」フラッシュ spec（純関数）。
 */

/** @typedef {'none'|'soft'|'hard'|'jackpot'} CelebrationPikaTier */

/**
 * @param {import('./supportCelebration.js').SupportCelebrationSpec} spec
 * @returns {CelebrationPikaTier}
 */
export function pikaTierForSupportCelebration(spec) {
  if (!spec) return 'none';
  if (spec.kind === 'comment_milestone') {
    const m = Number(String(spec.dedupeKey || '').replace('comment_', '')) || 0;
    if (m >= 1000) return 'jackpot';
    if (m >= 500) return 'hard';
    if (m >= 100) return 'soft';
    return 'none';
  }
  if (spec.kind === 'event_rank_up') {
    const rank = Number(String(spec.dedupeKey || '').replace('event_rank_', '')) || 99;
    if (rank <= 3) return 'hard';
    if (rank <= 10) return 'soft';
    return 'none';
  }
  if (spec.kind === 'gift_milestone') {
    const n = Number(String(spec.dedupeKey || '').replace('gift_', '')) || 0;
    if (n >= 25) return 'soft';
    if (n >= 10) return 'soft';
    return 'none';
  }
  if (spec.kind === 'ad_points_milestone') {
    const pt = Number(String(spec.dedupeKey || '').replace('ad_pts_', '')) || 0;
    if (pt >= 10000) return 'hard';
    if (pt >= 1000) return 'soft';
    return 'none';
  }
  return 'none';
}

/**
 * @param {import('./giftBahamutCelebration.js').GiftBahamutSpec} spec
 * @returns {CelebrationPikaTier}
 */
export function pikaTierForGiftBahamut(spec) {
  if (!spec) return 'none';
  if (spec.tier === 'mega') return 'jackpot';
  if (spec.tier === 'large') return 'hard';
  if (spec.tier === 'medium') return 'soft';
  return 'none';
}

/**
 * @param {CelebrationPikaTier} tier
 * @returns {number}
 */
export function pikaBurstCountForTier(tier) {
  if (tier === 'jackpot') return 3;
  if (tier === 'hard') return 2;
  if (tier === 'soft') return 1;
  return 0;
}
