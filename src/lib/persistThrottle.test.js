import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPersistCoalescer } from './persistThrottle.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createPersistCoalescer', () => {
  it('初回 enqueue は delay=0 で即 flush される', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][1]).toEqual({ sources: [] });
    expect(c.pending()).toBe(0);
  });

  it('2回目の enqueue 後 minIntervalMs 以内は flush されない', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    c.enqueue([{ id: '2' }]);
    vi.advanceTimersByTime(200);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(1);
  });

  it('初回の複数 enqueue は delay=0 でまとめて flush される', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    c.enqueue([{ id: '2' }, { id: '3' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ id: '1' }, { id: '2' }, { id: '3' }], {
      sources: []
    });
    expect(c.pending()).toBe(0);
  });

  it('初回の連続 enqueue は delay=0 で1回の flush にまとまる', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    for (let i = 0; i < 10; i++) c.enqueue([{ id: String(i) }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toHaveLength(10);
    expect(flush.mock.calls[0][1]).toEqual({ sources: [] });
  });

  it('enqueue の第2引数 source が flush の meta.sources に順に積まれる', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: 'a' }], 'ndgr');
    c.enqueue([{ id: 'b' }], 'mutation');
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(flush.mock.calls[0][1]).toEqual({ sources: ['ndgr', 'mutation'] });
  });

  it('clear でバッファがリセットされる', () => {
    const flush = vi.fn();
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }, { id: '2' }]);
    c.clear();
    expect(c.pending()).toBe(0);
    vi.advanceTimersByTime(500);
    expect(flush).not.toHaveBeenCalled();
  });

  it('前回 flush から十分経過していれば遅延なく flush される', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(400);
    c.enqueue([{ id: 'second' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[1][0]).toEqual([{ id: 'second' }]);
    expect(flush.mock.calls[1][1]).toEqual({ sources: [] });
  });

  it('手動 flush で即座にバッファを処理できる', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300);
    c.enqueue([{ id: '1' }]);
    await c.flush();
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(0);
  });

  it('burstThreshold を超えると minIntervalMs を待たず flush される', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300, 5);
    // 初回 flush を消化し、lastFlushTime をセット
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(1);

    // クールダウン中（300ms 以内）でもバースト閾値到達で即 flush
    vi.advanceTimersByTime(50);
    c.enqueue([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }]);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(2);
    expect(flushFn.mock.calls[1][0]).toHaveLength(5);
    expect(flushFn.mock.calls[1][1]).toEqual({ sources: [] });
    expect(c.pending()).toBe(0);
  });

  it('burstThreshold 未満のときは通常の throttle 挙動', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300, 100);
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    c.enqueue([{ id: '1' }, { id: '2' }]);
    vi.advanceTimersByTime(100);
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(2);
  });

  it('burstThreshold=0 は無効（既定 throttle のまま）', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300, 0);
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    // 大量 enqueue しても 0 は「無効」扱い
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    c.enqueue(rows);
    vi.advanceTimersByTime(100);
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(500);
  });

  it('await flushFn の途中で追加入力されても flushFn が重ならず直列フラッシュできる', async () => {
    // burst + Promise の順序だけに依存しないよう実タイマ
    vi.useRealTimers();

    try {
      /** @type {(() => void) | null} */
      let gateOpen = null;
      const barrier = new Promise((resolve) => {
        gateOpen = resolve;
      });

      /** @returns {{ id: string }[]} */
      const batch = (pfx) =>
        [...Array.from({ length: 5 }, (_, i) => ({ id: `${pfx}${i}` }))];

      /** @type {ReturnType<typeof createPersistCoalescer> | null} */
      let sink = null;

      let seededSecondBatch = false;
      let overlap = 0;
      let maxOverlap = 0;

      const flushFn = vi.fn(async () => {
        overlap += 1;
        maxOverlap = Math.max(maxOverlap, overlap);
        try {
          if (!seededSecondBatch) {
            seededSecondBatch = true;
            /* flushBody の drain 〜 await flush の間にもう一通り「積める」状態を再現する */
            sink?.enqueue(batch('b'));
          }
          await barrier;
        } finally {
          overlap -= 1;
        }
      });

      sink = createPersistCoalescer(flushFn, 600_000, 5);

      sink.enqueue(batch('a'));

      await new Promise((r) => queueMicrotask(r));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();

      expect(maxOverlap).toBe(1);
      expect(flushFn).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      /** キュー済みフラッシュまで */
      await new Promise((r) => queueMicrotask(r));

      expect(maxOverlap).toBe(1);
      expect(flushFn).toHaveBeenCalledTimes(1);
      gateOpen?.();
      await barrier;
      /** @type {Promise<void>} */
      const job0 = flushFn.mock.results[0]?.value;
      if (job0 && typeof /** @type {any} */ (job0)?.then === 'function') await job0;
      /** @type {Promise<void>} */
      const job1 = flushFn.mock.results[1]?.value;
      if (job1 && typeof /** @type {any} */ (job1)?.then === 'function') await job1;

      expect(flushFn).toHaveBeenCalledTimes(2);
      expect(flushFn.mock.calls[0][0]).toHaveLength(5);
      expect(flushFn.mock.calls[1][0]).toHaveLength(5);
      expect(maxOverlap).toBe(1);
      expect(sink.pending()).toBe(0);
    } finally {
      vi.useFakeTimers();
    }
  });
});
