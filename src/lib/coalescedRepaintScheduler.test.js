import { describe, it, expect, vi } from 'vitest';
import { createCoalescedRepaintScheduler } from './coalescedRepaintScheduler.js';

/** yieldToBrowserPaint 相当を即時解決するモック(実タイミングに依存しないテストにする)。 */
function makeImmediateYieldFn() {
  return vi.fn(() => Promise.resolve());
}

describe('createCoalescedRepaintScheduler', () => {
  it('同一tick内で複数回 schedule() してもコールバックは1回だけ実行される(束ね本体)', async () => {
    const callback = vi.fn();
    const yieldFn = makeImmediateYieldFn();
    const scheduler = createCoalescedRepaintScheduler(callback, { yieldFn });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(callback).not.toHaveBeenCalled();
    // yieldFn は最初の schedule() でのみ呼ばれる(2回目以降は pending で無視)。
    expect(yieldFn).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('コールバック実行完了後、再度 schedule() すれば次のコールバックが実行される', async () => {
    const callback = vi.fn();
    const yieldFn = makeImmediateYieldFn();
    const scheduler = createCoalescedRepaintScheduler(callback, { yieldFn });

    scheduler.schedule();
    await Promise.resolve();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    await Promise.resolve();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(yieldFn).toHaveBeenCalledTimes(2);
  });

  it('isPending() は schedule 直後 true、コールバック実行後 false を返す', async () => {
    const callback = vi.fn();
    const yieldFn = makeImmediateYieldFn();
    const scheduler = createCoalescedRepaintScheduler(callback, { yieldFn });

    expect(scheduler.isPending()).toBe(false);
    scheduler.schedule();
    expect(scheduler.isPending()).toBe(true);

    await Promise.resolve();
    await Promise.resolve();

    expect(scheduler.isPending()).toBe(false);
  });

  it('yieldFn を省略すると既定(yieldToBrowserPaint)が使われても例外にならない', () => {
    const callback = vi.fn();
    const scheduler = createCoalescedRepaintScheduler(callback);
    expect(() => scheduler.schedule()).not.toThrow();
  });
});
