import { describe, it, expect } from 'vitest';
import { retrySnapshotRequestUntilReady } from './popupWatchSnapshotRetry.js';

/**
 * テスト用の fakeSleep：実時間待たずに呼び出し順と ms を記録するだけ。
 * @returns {{ log: number[], sleep: (ms: number) => Promise<void> }}
 */
function createFakeSleep() {
  /** @type {number[]} */
  const log = [];
  return {
    log,
    sleep: async (ms) => {
      log.push(ms);
    }
  };
}

describe('retrySnapshotRequestUntilReady', () => {
  it('初回で snapshot が返れば、リトライしない', async () => {
    let calls = 0;
    const fakeSleep = createFakeSleep();
    const result = await retrySnapshotRequestUntilReady(
      async () => {
        calls += 1;
        return { snapshot: { liveId: 'lv1' }, error: '' };
      },
      { sleep: fakeSleep.sleep }
    );
    expect(calls).toBe(1);
    expect(fakeSleep.log).toEqual([]);
    expect(result.snapshot).toEqual({ liveId: 'lv1' });
  });

  it('1回目 null / 2回目 OK なら 1 回 sleep して返す', async () => {
    let calls = 0;
    const fakeSleep = createFakeSleep();
    const result = await retrySnapshotRequestUntilReady(
      async () => {
        calls += 1;
        return calls < 2
          ? { snapshot: null, error: 'not ready' }
          : { snapshot: { liveId: 'lv2' }, error: '' };
      },
      { sleep: fakeSleep.sleep, baseDelayMs: 100 }
    );
    expect(calls).toBe(2);
    expect(fakeSleep.log).toEqual([100]);
    expect(result.snapshot).toEqual({ liveId: 'lv2' });
  });

  it('3 回全部 null なら最後の失敗結果を返す。sleep は 2 回（間だけ）', async () => {
    let calls = 0;
    const fakeSleep = createFakeSleep();
    const result = await retrySnapshotRequestUntilReady(
      async () => {
        calls += 1;
        return { snapshot: null, error: `attempt ${calls}` };
      },
      { sleep: fakeSleep.sleep, baseDelayMs: 100, maxAttempts: 3 }
    );
    expect(calls).toBe(3);
    // 1回目→2回目 の間に 100ms、2回目→3回目 の間に 200ms
    expect(fakeSleep.log).toEqual([100, 200]);
    expect(result.snapshot).toBeNull();
    expect(result.error).toBe('attempt 3');
  });

  it('maxAttempts=1 なら sleep 無し、1 回だけ呼ぶ', async () => {
    let calls = 0;
    const fakeSleep = createFakeSleep();
    const result = await retrySnapshotRequestUntilReady(
      async () => {
        calls += 1;
        return { snapshot: null, error: '' };
      },
      { sleep: fakeSleep.sleep, maxAttempts: 1 }
    );
    expect(calls).toBe(1);
    expect(fakeSleep.log).toEqual([]);
    expect(result.snapshot).toBeNull();
  });

  it('baseDelayMs が 0 でも通る（即リトライ）', async () => {
    let calls = 0;
    const fakeSleep = createFakeSleep();
    const result = await retrySnapshotRequestUntilReady(
      async () => {
        calls += 1;
        return calls < 3
          ? { snapshot: null, error: '' }
          : { snapshot: { liveId: 'lv3' }, error: '' };
      },
      { sleep: fakeSleep.sleep, baseDelayMs: 0, maxAttempts: 3 }
    );
    expect(calls).toBe(3);
    expect(fakeSleep.log).toEqual([0, 0]);
    expect(result.snapshot).toEqual({ liveId: 'lv3' });
  });

  it('既定値: maxAttempts=3, baseDelayMs=450', async () => {
    let calls = 0;
    const fakeSleep = createFakeSleep();
    await retrySnapshotRequestUntilReady(
      async () => {
        calls += 1;
        return { snapshot: null, error: '' };
      },
      { sleep: fakeSleep.sleep }
    );
    expect(calls).toBe(3);
    expect(fakeSleep.log).toEqual([450, 900]);
  });

  it('不正な maxAttempts は 1 にフロアされる', async () => {
    let calls = 0;
    const fakeSleep = createFakeSleep();
    await retrySnapshotRequestUntilReady(
      async () => {
        calls += 1;
        return { snapshot: null, error: '' };
      },
      { sleep: fakeSleep.sleep, maxAttempts: 0 }
    );
    expect(calls).toBe(1);
  });
});
