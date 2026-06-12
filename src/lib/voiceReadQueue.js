/**
 * 読み上げキュー末尾へ追加し、上限超過分を古い順に返す。
 * @template T
 * @param {readonly T[]|unknown} queue
 * @param {T} item
 * @param {{ max?: number }} [opts]
 * @returns {{ queue: T[], dropped: T[] }}
 */
export function pushVoiceQueue(queue, item, { max = 5 } = {}) {
  const current = Array.isArray(queue) ? [...queue] : [];
  current.push(item);
  const rawMax = Number(max);
  const limit = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 5;
  const dropCount = Math.max(0, current.length - limit);
  return {
    queue: current.slice(dropCount),
    dropped: current.slice(0, dropCount)
  };
}

/**
 * 待機件数に応じて VOICEVOX speedScale へ加える値を返す。
 * @param {unknown} queueLength
 * @returns {number}
 */
export function computeVoiceQueueSpeedBoost(queueLength) {
  const length = Math.max(0, Math.floor(Number(queueLength) || 0));
  if (length >= 5) return 0.2;
  if (length >= 3) return 0.1;
  return 0;
}
