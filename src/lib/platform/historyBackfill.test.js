import { describe, expect, it, vi } from 'vitest';
import {
  BACKFILL_MAX_ITEMS,
  BACKFILL_MAX_PAGES,
  backfillBudgetStopReason,
  backfillRetryDelayMs,
  runBackfillLoop,
} from './historyBackfill.js';

describe('historyBackfill', () => {
  it('backfillRetryDelayMs は倍々バックオフし上限で頭打ちにする', () => {
    expect(backfillRetryDelayMs(0)).toBe(1000);
    expect(backfillRetryDelayMs(1)).toBe(2000);
    expect(backfillRetryDelayMs(2)).toBe(4000);
    expect(backfillRetryDelayMs(3)).toBe(8000);
    expect(backfillRetryDelayMs(4)).toBe(16000);
    expect(backfillRetryDelayMs(10)).toBe(16000);
    expect(backfillRetryDelayMs(0, 5)).toBe(5000);
    expect(backfillRetryDelayMs(0, 120)).toBe(30000);
  });

  it('backfillBudgetStopReason は上限判定を返す', () => {
    expect(backfillBudgetStopReason({ pages: 0, items: 0 })).toBe('');
    expect(backfillBudgetStopReason({ pages: BACKFILL_MAX_PAGES, items: 10 })).toBe('max-pages');
    expect(backfillBudgetStopReason({ pages: 1, items: BACKFILL_MAX_ITEMS })).toBe('max-items');
  });

  it('runBackfillLoop は複数ページを 550ms 間隔で進み、stopReason で止まる', async () => {
    const sleeps = [];
    const received = [];
    const res = await runBackfillLoop({
      initialCursor: 'c0',
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchPage: async (cursor) => {
        if (cursor === 'c0') return { ok: true, items: ['a', 'b'], nextCursor: 'c1' };
        if (cursor === 'c1') return { ok: true, items: ['c'], nextCursor: '', stopReason: 'reached-start' };
        return { ok: true, items: [], nextCursor: '', stopReason: 'empty' };
      },
      onItems: (items) => {
        received.push(...items);
        return items.length;
      },
    });
    expect(res).toEqual({ pages: 2, items: 3, fails: 0, stopReason: 'reached-start' });
    expect(received).toEqual(['a', 'b', 'c']);
    expect(sleeps).toEqual([550]);
  });

  it('runBackfillLoop は 429 リトライ後に復旧し、諦め時は止まる', async () => {
    const sleeps = [];
    let calls = 0;
    const okRes = await runBackfillLoop({
      initialCursor: 'c0',
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchPage: async () => {
        calls += 1;
        if (calls <= 2) return { ok: false, retryable: true, status: 429 };
        return { ok: true, items: ['x'], nextCursor: '', stopReason: 'done' };
      },
      onItems: (items) => items.length,
    });
    expect(okRes).toEqual({ pages: 1, items: 1, fails: 2, stopReason: 'done' });
    expect(sleeps).toEqual([1000, 2000]);

    const failRes = await runBackfillLoop({
      initialCursor: 'c0',
      sleep: vi.fn(async () => {}),
      maxRetries: 2,
      fetchPage: async () => ({ ok: false, retryable: true, status: 429 }),
      onItems: () => 0,
    });
    expect(failRes).toEqual({ pages: 0, items: 0, fails: 3, stopReason: 'rate-limit' });
  });
});
