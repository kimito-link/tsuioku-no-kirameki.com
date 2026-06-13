/**
 * 読み上げアイテムが鮮度切れかどうか判定する純関数。
 * 
 * @param {number} enqueuedAt - enqueue時のDate.now()
 * @param {number} now - 現在時刻
 * @param {number} queueLength - 現在のキュー長
 * @param {boolean} [isHighPriority=false] - ギフトなど確実に読みたいアイテムか
 * @returns {{ stale: boolean, reason: string }}
 */
export function isVoiceItemStale(enqueuedAt, now, queueLength, isHighPriority = false) {
  if (typeof enqueuedAt !== 'number' || typeof now !== 'number' || typeof queueLength !== 'number') {
    return { stale: false, reason: '' };
  }
  if (enqueuedAt > now || enqueuedAt <= 0) {
    return { stale: false, reason: '' };
  }

  const ageMs = now - enqueuedAt;

  // ギフト等は長め（8秒）まで許容
  if (isHighPriority) {
    if (ageMs > 8000) return { stale: true, reason: `age ${ageMs}ms > 8000ms (high priority)` };
    return { stale: false, reason: '' };
  }

  // 通常コメント: 基本5秒、キュー長が5件以上なら3秒に短縮してドロップを加速
  const thresholdMs = queueLength >= 5 ? 3000 : 5000;
  if (ageMs > thresholdMs) {
    return { stale: true, reason: `age ${ageMs}ms > ${thresholdMs}ms (q: ${queueLength})` };
  }

  return { stale: false, reason: '' };
}
