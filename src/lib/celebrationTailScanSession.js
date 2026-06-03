/**
 * popup のコメント末尾スキャン: 配信ごとに初回だけ tail を prime し、
 * 開いた瞬間に過去のギフト／広告コメントで演出が連発しないようにする。
 */

/** @type {Set<string>} */
const tailPrimedLiveIds = new Set();

/**
 * この liveId で tail 初回 prime をまだ行っていなければスロットを消費して true。
 * @param {string} liveId
 * @returns {boolean}
 */
export function consumeCelebrationTailPrimeSlot(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || tailPrimedLiveIds.has(lid)) return false;
  tailPrimedLiveIds.add(lid);
  return true;
}

/** テスト用 */
export function resetCelebrationTailPrimeSession() {
  tailPrimedLiveIds.clear();
}
