import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  STORAGE_OP_TIMED_OUT,
  runStorageOpWithTimeout
} from './storageOpTimeout.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('runStorageOpWithTimeout', () => {
  it('正常時は opFn の解決値をそのまま返す', async () => {
    const op = vi.fn().mockResolvedValue({ ok: true });
    const p = runStorageOpWithTimeout(op, 4000);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('timeoutMs を超えても settle しない opFn は sentinel で reject される（永久 pending にしない）', async () => {
    // 決して解決しない Promise（多タブ stall で storage の await が永久 pending になる状況の模擬）
    const op = vi.fn(() => new Promise(() => {}));
    const p = runStorageOpWithTimeout(op, 4000);
    // reject を観測する handler を先に付けて unhandled rejection を防ぐ
    const settled = p.then(
      () => 'resolved',
      (err) => err
    );
    await vi.advanceTimersByTimeAsync(4000);
    await expect(settled).resolves.toBe(STORAGE_OP_TIMED_OUT);
  });

  it('timeout 前に解決すれば sentinel にはならない（タイマーは finally で破棄）', async () => {
    const op = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('done'), 1000);
        })
    );
    const p = runStorageOpWithTimeout(op, 4000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe('done');
  });

  it('timeoutMs が 0 以下 / 非有限なら無制限（opFn をそのまま await）', async () => {
    const op = vi.fn().mockResolvedValue('passthrough');
    await expect(runStorageOpWithTimeout(op, 0)).resolves.toBe('passthrough');
    await expect(runStorageOpWithTimeout(op, -1)).resolves.toBe('passthrough');
    await expect(runStorageOpWithTimeout(op, NaN)).resolves.toBe('passthrough');
  });

  it('opFn 自体が reject したらその理由がそのまま伝播する（sentinel ではない）', async () => {
    const boom = new Error('write failed');
    const op = vi.fn().mockRejectedValue(boom);
    const p = runStorageOpWithTimeout(op, 4000);
    const settled = p.then(
      () => 'resolved',
      (err) => err
    );
    await vi.runAllTimersAsync();
    await expect(settled).resolves.toBe(boom);
  });
});
