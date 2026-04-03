/**
 * サムネ IndexedDB の FIFO トリム用純関数（古い capturedAt 順＝先頭が最古）
 */

export const MAX_THUMBS_PER_LIVE = 500;

/**
 * @param {{ id: number, capturedAt: number }[]} sortedOldestFirst
 * @param {number} maxKeep
 * @returns {number[]}
 */
export function thumbIdsToDropForFifo(sortedOldestFirst, maxKeep) {
  const n = sortedOldestFirst.length;
  if (n <= maxKeep) return [];
  const drop = n - maxKeep;
  return sortedOldestFirst.slice(0, drop).map((r) => r.id);
}
