/**
 * v0.1.6xx: 複数タブ並列 backfill の動的throttle純関数(PR2)。
 *
 * 背景:
 *   並列度Nで backfill すると、メインスレッドの占有時間が延びて前面タブが固まる
 *   (応答しませんになる)リスクがある。これを防ぐため、`backfillYieldToPage` で
 *   ブラウザに制御を返した際、再開されるまでの「遅延時間(delayMs)」を測る。
 *   遅延が長い＝ページが重い(描画や入力が滞っている)と判断し、安全のため
 *   有効スロット数を自動で 1 (単一タブ相当) に降格する。軽くなればNに復帰する。
 *
 * 純関数(状態は呼び出し側が保持する)。
 *
 * @module backfillSlotAutoThrottle
 */

/** 最新の遅延値を EWMA に組み込む重み。0.2 = 直近の変動を適度に吸収する。 */
export const THROTTLE_EWMA_ALPHA = 0.2;

/**
 * 遅延のしきい値(ms)。
 * setTimeout(0) や scheduler.yield() の復帰に 50ms 以上かかる場合、
 * メインスレッドが詰まり気味(60fps維持不能)とみなす。
 */
export const THROTTLE_DELAY_THRESHOLD_MS = 50;

/**
 * @typedef {Object} BackfillThrottleState
 * @property {number} ewmaDelayMs 遅延の指数移動平均(ms)
 */

/**
 * スロットル監視の初期状態を作る。
 * @returns {BackfillThrottleState}
 */
export function createBackfillThrottleState() {
  return { ewmaDelayMs: 0 };
}

/**
 * yield にかかった実測遅延で EWMA を更新する(in-place)。
 *
 * @param {BackfillThrottleState} state
 * @param {unknown} measuredDelayMs 今回の yield 復帰までにかかった時間(ms)
 * @returns {number} 更新後の EWMA 遅延時間
 */
export function updateBackfillThrottleState(state, measuredDelayMs) {
  const delay = typeof measuredDelayMs === 'number' && Number.isFinite(measuredDelayMs) ? measuredDelayMs : NaN;
  if (Number.isNaN(delay) || delay < 0) return state.ewmaDelayMs;

  if (state.ewmaDelayMs === 0) {
    // 初回はそのまま採用して跳ね上がりを防ぐ
    state.ewmaDelayMs = delay;
  } else {
    state.ewmaDelayMs = state.ewmaDelayMs * (1 - THROTTLE_EWMA_ALPHA) + delay * THROTTLE_EWMA_ALPHA;
  }
  return state.ewmaDelayMs;
}

/**
 * 現在の重さに応じて、有効なスロット数を解決する。
 * ページが重ければ(EWMA > 閾値)、安全のために 1 に降格する。
 *
 * @param {BackfillThrottleState} state
 * @param {number} maxSlots 最大(本来)の並列度
 * @returns {number} 実際に使うべきスロット数(1..maxSlots)
 */
export function resolveEffectiveBackfillSlots(state, maxSlots) {
  const slots = Math.max(1, Math.floor(Number(maxSlots) || 1));
  if (state.ewmaDelayMs > THROTTLE_DELAY_THRESHOLD_MS) {
    // 重いので 1 に降格(完全直列化して前面タブを守る)
    return 1;
  }
  return slots;
}
