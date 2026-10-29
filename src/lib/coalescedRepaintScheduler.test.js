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

  describe('v0.1.1816: minIntervalMs(隠れている間は間隔を空ける)', () => {
    function harness(gapRef) {
      let now = 1000;
      const timers = [];
      const callback = vi.fn();
      const scheduler = createCoalescedRepaintScheduler(callback, {
        yieldFn: makeImmediateYieldFn(),
        minIntervalMs: () => gapRef.value,
        nowFn: () => now,
        setTimeoutFn: (fn, ms) => timers.push({ fn, at: now + ms })
      });
      const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
      const advance = (ms) => {
        now += ms;
        for (const t of timers.splice(0)) {
          if (t.at <= now) t.fn();
          else timers.push(t);
        }
      };
      return { callback, scheduler, flush, advance, timers };
    }

    it('間隔 0 なら従来どおり毎回すぐ実行', async () => {
      const h = harness({ value: 0 });
      h.scheduler.schedule(); await h.flush();
      h.scheduler.schedule(); await h.flush();
      expect(h.callback).toHaveBeenCalledTimes(2);
      expect(h.timers).toHaveLength(0);
    });

    it('間隔中の予約は束ねて、空いた時点で1回だけ実行する', async () => {
      const h = harness({ value: 1500 });
      h.scheduler.schedule(); await h.flush();
      expect(h.callback).toHaveBeenCalledTimes(1);
      h.advance(200);
      h.scheduler.schedule(); await h.flush();
      h.scheduler.schedule(); await h.flush();
      expect(h.callback).toHaveBeenCalledTimes(1);
      expect(h.scheduler.isPending()).toBe(true);
      h.advance(1000);
      expect(h.callback).toHaveBeenCalledTimes(1);
      h.advance(300);
      expect(h.callback).toHaveBeenCalledTimes(2);
      expect(h.scheduler.isPending()).toBe(false);
    });

    it('間隔は実行のたびに聞く(見えるようになったら次からすぐ)', async () => {
      const gap = { value: 1500 };
      const h = harness(gap);
      h.scheduler.schedule(); await h.flush();
      gap.value = 0;
      h.advance(10);
      h.scheduler.schedule(); await h.flush();
      expect(h.callback).toHaveBeenCalledTimes(2);
    });

    it('間隔の関数が投げても止まらず、すぐ実行する', async () => {
      const callback = vi.fn();
      const scheduler = createCoalescedRepaintScheduler(callback, {
        yieldFn: makeImmediateYieldFn(),
        minIntervalMs: () => { throw new Error('x'); }
      });
      scheduler.schedule();
      await Promise.resolve(); await Promise.resolve();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
