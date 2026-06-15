/**
 * 読み上げアイテムが鮮度切れかどうか判定する純関数。
 *
 * v0.1.755 リアルタイム完璧化(星野ロミ会議・無料LLM全員集合): VOICEVOX 合成が実時間に
 *   追いつかずキューが詰まると、読み上げが実際のコメントから何十秒も遅れる(=「読み上げがだめ」
 *   の本命)。会議結論「最新優先・古い未合成は破棄・リアルタイム=今喋ってることだけ聞こえる」に
 *   沿って鮮度しきい値を【積極的に短く】する。少し溜まったら即座に古いものを捨て、常に直近の
 *   コメントだけを読む。ギフト等の高優先は確実に読みたいので長めを維持。
 *
 * @param {number} enqueuedAt - enqueue時のDate.now()
 * @param {number} now - 現在時刻
 * @param {number} queueLength - 現在のキュー長
 * @param {boolean} [isHighPriority=false] - ギフトなど確実に読みたいアイテムか
 * @returns {{ stale: boolean, reason: string }}
 */

/** 通常コメントの鮮度しきい値(ms・キューが空いている時)。これを超えたら読まずに捨てる。 */
export const VOICE_STALE_MS_NORMAL = 2500;
/** バックログがある時(queueLength >= VOICE_STALE_BACKLOG_QUEUE)の短縮しきい値(ms)。 */
export const VOICE_STALE_MS_BACKLOG = 1200;
/** この件数以上溜まったら短縮しきい値に切り替えてドロップを加速(リアルタイム維持)。 */
export const VOICE_STALE_BACKLOG_QUEUE = 3;
/** ギフト等の高優先は確実に読みたいので長め(ms)。 */
export const VOICE_STALE_MS_HIGH_PRIORITY = 6000;

/**
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

  // ギフト等は長め(確実に読む)。
  if (isHighPriority) {
    if (ageMs > VOICE_STALE_MS_HIGH_PRIORITY) {
      return { stale: true, reason: `age ${ageMs}ms > ${VOICE_STALE_MS_HIGH_PRIORITY}ms (high priority)` };
    }
    return { stale: false, reason: '' };
  }

  // 通常コメント: 基本 2.5秒。少しでも溜まったら(3件以上)1.2秒に短縮してドロップを加速し、
  //   常に「今」のコメントだけを読む(リアルタイム=溜まった古い読み上げを聞かせない)。
  const thresholdMs =
    queueLength >= VOICE_STALE_BACKLOG_QUEUE ? VOICE_STALE_MS_BACKLOG : VOICE_STALE_MS_NORMAL;
  if (ageMs > thresholdMs) {
    return { stale: true, reason: `age ${ageMs}ms > ${thresholdMs}ms (q: ${queueLength})` };
  }

  return { stale: false, reason: '' };
}
