import { describe, it, expect, vi } from 'vitest';
import { createInFlightGuard } from './inFlightGuard.js';

describe('createInFlightGuard', () => {
  it('解決済みなら次回 run() は opFn を再発行する', async () => {
    let calls = 0;
    const opFn = vi.fn(async () => {
      calls += 1;
      return `ok-${calls}`;
    });
    const guard = createInFlightGuard(opFn);

    const r1 = await guard.run('fallback');
    expect(r1).toBe('ok-1');
    expect(guard.isInFlight()).toBe(false);

    const r2 = await guard.run('fallback');
    expect(r2).toBe('ok-2');
    expect(opFn).toHaveBeenCalledTimes(2);
  });

  it('未解決中に呼ばれたら fallback を返し、新規発行を抑制する', async () => {
    let resolveFirst;
    const opFn = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const guard = createInFlightGuard(opFn);

    const p1 = guard.run('fallback1');
    expect(guard.isInFlight()).toBe(true);

    // 未解決の間に2回目を発行 → opFn は再度呼ばれず fallback が返る。
    const r2 = await guard.run('fallback2');
    expect(r2).toBe('fallback2');
    expect(opFn).toHaveBeenCalledTimes(1);

    resolveFirst('resolved');
    const r1 = await p1;
    expect(r1).toBe('resolved');
    expect(guard.isInFlight()).toBe(false);
  });

  it('ceilingMs 超過で固着とみなし再発行を許可する(now 注入)', async () => {
    let nowMs = 0;
    const now = () => nowMs;
    let firstResolve;
    let secondCallStarted = false;
    const opFn = vi.fn(() => {
      if (!secondCallStarted && firstResolve === undefined) {
        return new Promise((resolve) => {
          firstResolve = resolve;
        });
      }
      secondCallStarted = true;
      return Promise.resolve('second-result');
    });
    const guard = createInFlightGuard(opFn, { ceilingMs: 1000, now });

    const p1 = guard.run('fallback');
    expect(guard.isInFlight()).toBe(true);

    // ceiling 未満: まだ fallback。
    nowMs = 500;
    const rBefore = await guard.run('fallback');
    expect(rBefore).toBe('fallback');
    expect(opFn).toHaveBeenCalledTimes(1);

    // ceiling 超過: 再発行を許可。
    nowMs = 1500;
    const rAfter = await guard.run('fallback');
    expect(rAfter).toBe('second-result');
    expect(opFn).toHaveBeenCalledTimes(2);

    // 元の Promise がその後解決しても呼び出し元は既に fallback 経路を終えている。
    firstResolve('late-resolved');
    await p1;
  });

  it('opFn が reject したら isInFlight は false に戻る', async () => {
    const opFn = vi.fn(async () => {
      throw new Error('boom');
    });
    const guard = createInFlightGuard(opFn);

    await expect(guard.run('fallback')).rejects.toThrow('boom');
    expect(guard.isInFlight()).toBe(false);
  });

  it('既定 ceilingMs は 15000ms(now 注入で境界確認)', async () => {
    let nowMs = 0;
    const now = () => nowMs;
    let calls = 0;
    const opFn = vi.fn(() => {
      calls += 1;
      // 1回目は未解決のまま留める(in-flight 状態を作る)。2回目(ceiling超過後の再発行)は即解決。
      return calls === 1 ? new Promise(() => {}) : Promise.resolve('second-result');
    });
    const guard = createInFlightGuard(opFn, { now });

    void guard.run('fallback');
    nowMs = 14999;
    expect(await guard.run('fallback')).toBe('fallback');
    expect(opFn).toHaveBeenCalledTimes(1);

    nowMs = 15000;
    // ceiling ちょうどは超過扱い(elapsed(15000) < ceilingMs(15000) が false)→ 再発行される。
    const opFn2Result = await guard.run('fallback');
    expect(opFn2Result).toBe('second-result');
    expect(opFn).toHaveBeenCalledTimes(2);
  });
});
