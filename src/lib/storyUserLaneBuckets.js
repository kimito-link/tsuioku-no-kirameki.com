/**
 * 応援ユーザーレーン: ソート済み候補を tier（profileTier）別に上限付きで分割する。
 * 単一リスト先頭 maxTotal 件と同じ集合・同じ優先順位だが、りんく説明直下には tier3 のみを置ける。
 *
 * @template T
 * @param {Array<T & { profileTier: number }>} sortedCandidates profileTier 降順で整列済み
 * @param {number} maxTotal
 * @returns {{ link: T[], konta: T[], tanu: T[] }}
 */
export function bucketStoryUserLanePicks(sortedCandidates, maxTotal) {
  const n = Math.max(0, Math.floor(Number(maxTotal) || 0));
  const a3 = sortedCandidates.filter((c) => c.profileTier === 3);
  const a2 = sortedCandidates.filter((c) => c.profileTier === 2);
  const a1 = sortedCandidates.filter((c) => c.profileTier === 1);
  let rem = n;
  const link = a3.slice(0, rem);
  rem -= link.length;
  const konta = a2.slice(0, rem);
  rem -= konta.length;
  const tanu = a1.slice(0, rem);
  return { link, konta, tanu };
}

/**
 * @param {{ link: unknown[], konta: unknown[], tanu: unknown[] }} b
 * @returns {unknown[]}
 */
export function flattenStoryUserLaneBuckets(b) {
  return [...b.link, ...b.konta, ...b.tanu];
}
