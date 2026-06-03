/**
 * コメント走査系演出のシード（過去分を再発火させない）制御。
 * 配列が伸びただけのときに新着まで primed してしまうと、自分の広告コメが無反応になる。
 */

/**
 * 配信切替など、履歴全体を一度 primed してから return すべきか。
 * @param {boolean} broadcastChanged
 * @param {number} prevSeededLen 未シードは -1
 * @returns {boolean}
 */
export function shouldFullPrimeCelebrationCommentSeed(broadcastChanged, prevSeededLen) {
  return broadcastChanged || prevSeededLen < 0;
}

/**
 * 配列が伸びたとき、旧 prefix だけ primed に追加する開始インデックス。
 * @param {boolean} broadcastChanged
 * @param {number} prevSeededLen
 * @param {number} entriesLen
 * @returns {number|null} full prime 時は null
 */
export function celebrationSeedPrefixEndIndex(broadcastChanged, prevSeededLen, entriesLen) {
  if (shouldFullPrimeCelebrationCommentSeed(broadcastChanged, prevSeededLen)) return null;
  const prev = Math.max(0, Math.floor(prevSeededLen));
  const len = Math.max(0, Math.floor(entriesLen));
  if (len <= prev) return prev;
  return prev;
}
