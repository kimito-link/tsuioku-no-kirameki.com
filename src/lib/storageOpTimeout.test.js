import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  STORAGE_OP_TIMED_OUT,
  runStorageOpWithTimeout,
  startStorageOpWithTimeout
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

describe('startStorageOpWithTimeout（2026-07-14 診断ページ608秒固まり根治: race有界化+op生observable両立）', () => {
  it('race が sentinel で reject しても op は opFn の解決値へ後から到達できる（幽霊readの観測）', async () => {
    let resolveOp;
    const op = vi.fn(() => new Promise((resolve) => { resolveOp = resolve; }));
    const { race, op: opPromise } = startStorageOpWithTimeout(op, 4000);
    const raceSettled = race.then(
      () => 'resolved',
      (err) => err
    );
    await vi.advanceTimersByTimeAsync(4000);
    await expect(raceSettled).resolves.toBe(STORAGE_OP_TIMED_OUT);
    // race が timeout した後、opFn が実際に解決すれば op 側はそれを観測できる。
    resolveOp('late-value');
    await expect(opPromise).resolves.toBe('late-value');
  });

  it('timeoutMs<=0 なら race===op（無制限・従来どおり）', async () => {
    const op = vi.fn().mockResolvedValue('passthrough');
    const { race, op: opPromise } = startStorageOpWithTimeout(op, 0);
    expect(race).toBe(opPromise);
    await expect(race).resolves.toBe('passthrough');
  });

  it('timeout 前に解決すれば race は解決値を返す（タイマーは finally で破棄）', async () => {
    const op = vi.fn(
      () => new Promise((resolve) => { setTimeout(() => resolve('done'), 1000); })
    );
    const { race } = startStorageOpWithTimeout(op, 4000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(race).resolves.toBe('done');
  });

  it('opFn が同期的に throw しても reject に正規化される（race・op 双方）', async () => {
    const op = vi.fn(() => { throw new Error('sync boom'); });
    const { race, op: opPromise } = startStorageOpWithTimeout(op, 4000);
    const raceSettled = race.then(() => 'resolved', (err) => err.message);
    const opSettled = opPromise.then(() => 'resolved', (err) => err.message);
    await vi.runAllTimersAsync();
    await expect(raceSettled).resolves.toBe('sync boom');
    await expect(opSettled).resolves.toBe('sync boom');
  });
});
