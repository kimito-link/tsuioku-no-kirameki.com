import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollUntil } from './pollUntil.js';

describe('pollUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fn が真値を返したら即解決', async () => {
    const p = pollUntil(() => 'ok', { timeoutMs: 1000, intervalMs: 50 });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
  });

  it('数回ポーリング後に真値', async () => {
    let n = 0;
    const p = pollUntil(() => {
      n += 1;
      return n >= 3 ? 'ready' : null;
    }, { timeoutMs: 2000, intervalMs: 20 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBe('ready');
  });

  it('タイムアウトで null', async () => {
    const p = pollUntil(() => null, { timeoutMs: 100, intervalMs: 30 });
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBeNull();
  });
});
