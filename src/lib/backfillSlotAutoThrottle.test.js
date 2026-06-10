import { describe, it, expect } from 'vitest';
import {
  createBackfillThrottleState,
  updateBackfillThrottleState,
  resolveEffectiveBackfillSlots,
  THROTTLE_DELAY_THRESHOLD_MS
} from './backfillSlotAutoThrottle.js';

describe('backfillSlotAutoThrottle', () => {
  it('初期状態は EWMA 0', () => {
    const st = createBackfillThrottleState();
    expect(st.ewmaDelayMs).toBe(0);
  });

  it('初回 update では跳ね上がり防止のためそのまま採用する', () => {
    const st = createBackfillThrottleState();
    updateBackfillThrottleState(st, 10);
    expect(st.ewmaDelayMs).toBe(10);
  });

  it('2回目以降は EWMA に基づいて緩やかに追従する', () => {
    const st = createBackfillThrottleState();
    updateBackfillThrottleState(st, 10);
    // ALPHA = 0.2 なので: 10 * 0.8 + 20 * 0.2 = 8 + 4 = 12
    updateBackfillThrottleState(st, 20);
    expect(st.ewmaDelayMs).toBe(12);

    // 12 * 0.8 + 60 * 0.2 = 9.6 + 12 = 21.6
    updateBackfillThrottleState(st, 60);
    expect(st.ewmaDelayMs).toBeCloseTo(21.6);
  });

  it('無効な入力は無視して状態を維持する', () => {
    const st = createBackfillThrottleState();
    updateBackfillThrottleState(st, 10);
    expect(updateBackfillThrottleState(st, -5)).toBe(10);
    // @ts-expect-error test
    expect(updateBackfillThrottleState(st, '10')).toBe(10);
    expect(updateBackfillThrottleState(st, NaN)).toBe(10);
  });

  describe('resolveEffectiveBackfillSlots', () => {
    it('遅延が閾値以下なら maxSlots をそのまま返す', () => {
      const st = createBackfillThrottleState();
      st.ewmaDelayMs = THROTTLE_DELAY_THRESHOLD_MS - 10;
      expect(resolveEffectiveBackfillSlots(st, 3)).toBe(3);
      expect(resolveEffectiveBackfillSlots(st, 2)).toBe(2);
    });

    it('遅延が閾値を超えたら安全のため 1 (単一タブ) に降格する', () => {
      const st = createBackfillThrottleState();
      st.ewmaDelayMs = THROTTLE_DELAY_THRESHOLD_MS + 10;
      expect(resolveEffectiveBackfillSlots(st, 3)).toBe(1);
    });

    it('maxSlots の無効値は 1 にフォールバックする', () => {
      const st = createBackfillThrottleState();
      // @ts-expect-error test
      expect(resolveEffectiveBackfillSlots(st, -1)).toBe(1);
      // @ts-expect-error test
      expect(resolveEffectiveBackfillSlots(st, 'foo')).toBe(1);
    });
  });
});
