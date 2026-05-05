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
});
