/**
 * 応援ユーザーレーンの候補ソート正本。
 * popup と venue が同じ比較器を使うことで、段組みDOMの並び drift を防ぐ。
 */

/**
 * @param {unknown} uidRaw
 * @returns {number}
 */
export function storyUserLaneUidSortRank(uidRaw) {
  const s = String(uidRaw || '').trim();
  if (/^\d{5,14}$/.test(s)) return 0;
  if (/^a:/i.test(s)) return 1;
  return 2;
}

/**
 * @param {{ profileTier?: number, thumbScore?: number, entry?: { userId?: unknown }, entryIndex?: number }} a
 * @param {{ profileTier?: number, thumbScore?: number, entry?: { userId?: unknown }, entryIndex?: number }} b
 * @returns {number}
 */
export function compareStoryUserLaneCandidates(a, b) {
  const tierA = Number(a?.profileTier) || 0;
  const tierB = Number(b?.profileTier) || 0;
  if (tierB !== tierA) return tierB - tierA;

  const thumbA = Number(a?.thumbScore) || 0;
  const thumbB = Number(b?.thumbScore) || 0;
  if (thumbB !== thumbA) return thumbB - thumbA;

  const ua = String(a?.entry?.userId || '').trim();
  const ub = String(b?.entry?.userId || '').trim();
  const ra = storyUserLaneUidSortRank(ua);
  const rb = storyUserLaneUidSortRank(ub);
  if (ra !== rb) return ra - rb;
  if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;

  const indexA = Number(a?.entryIndex) || 0;
  const indexB = Number(b?.entryIndex) || 0;
  return indexB - indexA;
}
