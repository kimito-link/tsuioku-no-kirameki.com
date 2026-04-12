import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPersistCoalescer } from './persistThrottle.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createPersistCoalescer', () => {
  it('enqueue 後 minIntervalMs 以内は flush されない', () => {
    const flush = vi.fn();
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    vi.advanceTimersByTime(200);
    expect(flush).not.toHaveBeenCalled();
    expect(c.pending()).toBe(1);
  });

  it('minIntervalMs 経過後に蓄積行がまとめて flush される', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    c.enqueue([{ id: '2' }, { id: '3' }]);
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ id: '1' }, { id: '2' }, { id: '3' }]);
    expect(c.pending()).toBe(0);
  });

  it('連続 enqueue は1回の flush にまとまる', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    for (let i = 0; i < 10; i++) c.enqueue([{ id: String(i) }]);
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toHaveLength(10);
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
  });

  it('手動 flush で即座にバッファを処理できる', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300);
    c.enqueue([{ id: '1' }]);
    await c.flush();
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(0);
  });
});
