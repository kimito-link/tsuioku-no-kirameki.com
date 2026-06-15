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
  if (item && typeof item === 'object' && /** @type {{priority?: string}} */ (item).priority === 'high') {
    // PR-V3: ギフト等優先アイテムは通常アイテムの前に割り込む
    const insertIdx = current.findIndex(x => !x || typeof x !== 'object' || /** @type {{priority?: string}} */ (x).priority !== 'high');
    if (insertIdx < 0) {
      current.push(item);
    } else {
      current.splice(insertIdx, 0, item);
    }
  } else {
    current.push(item);
  }
  const rawMax = Number(max);
  const limit = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 5;
  const dropCount = Math.max(0, current.length - limit);
  return {
    queue: current.slice(dropCount),
    dropped: current.slice(0, dropCount)
  };
}

/**
 * キュー内の同文項目を集約する。
 * @param {readonly { body?: unknown, count?: unknown }[]|unknown} queue
 * @param {{ body?: unknown, count?: unknown }|null|undefined} candidate
 * @returns {{
 *   queue: { body?: unknown, count?: unknown }[],
 *   merged: boolean
 * }}
 */
export function mergeRepeatedVoiceItem(queue, candidate) {
  const current = Array.isArray(queue) ? [...queue] : [];
  if (!candidate || typeof candidate !== 'object') {
    return { queue: current, merged: false };
  }
  const index = current.findIndex(
    (existing) =>
      existing &&
      typeof existing === 'object' &&
      existing.body === candidate.body
  );
  if (index < 0) return { queue: current, merged: false };

  const existing = current[index];
  const rawCount = Number(existing.count);
  const count =
    Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1;
  current[index] = { ...existing, count: count + 1 };
  return { queue: current, merged: true };
}

/**
 * プリフェッチが現在の項目と世代に一致するか返す。
 * @param {unknown} prefetch
 * @param {unknown} item
 * @param {unknown} generation
 * @returns {boolean}
 */
export function isVoicePrefetchUsable(prefetch, item, generation) {
  if (!prefetch || typeof prefetch !== 'object') return false;
  const state =
    /** @type {{ item?: unknown, generation?: unknown }} */ (prefetch);
  return state.item === item && state.generation === generation;
}

/**
 * 待機件数に応じた読み上げ速度と本文上限を返す。
 *
 * v0.1.755 リアルタイム完璧化(星野ロミ会議): 合成が実時間に追いつかない時、待つのでなく
 *   【速度を上げて本文を短く】して消化を速め、遅延を溜めない。会議結論「speedScale を上げて
 *   合成時間短縮(1.0→1.4で約30%短縮)」を取り込み、より早い段階(2件)から効かせ、最大ブーストも
 *   引き上げる(0.5→0.8)。これで「今喋ってること」に追いつき続ける。本文上限も詰まり時は短く。
 * @param {unknown} queueLength
 * @returns {{ speedBoost: number, maxChars: number }}
 */
export function computeVoiceCongestion(queueLength) {
  const rawLength = Number(queueLength);
  const length =
    Number.isFinite(rawLength) && rawLength >= 0 ? Math.floor(rawLength) : 0;
  if (length >= 8) return { speedBoost: 0.8, maxChars: 30 };
  if (length >= 5) return { speedBoost: 0.5, maxChars: 40 };
  if (length >= 3) return { speedBoost: 0.3, maxChars: 50 };
  if (length >= 2) return { speedBoost: 0.15, maxChars: 60 };
  return { speedBoost: 0, maxChars: 60 };
}

/**
 * 待機件数に応じて VOICEVOX speedScale へ加える値を返す。
 * @param {unknown} queueLength
 * @returns {number}
 */
export function computeVoiceQueueSpeedBoost(queueLength) {
  return computeVoiceCongestion(queueLength).speedBoost;
}
