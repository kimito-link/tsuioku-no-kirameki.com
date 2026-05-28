import { describe, it, expect } from 'vitest';
import {
  calculateBackfillRetryDelayMs,
  DEFAULT_BACKFILL_RETRY_BASE_MS,
  DEFAULT_BACKFILL_RETRY_CAP_MS,
  DEFAULT_BACKFILL_RETRY_FACTOR
} from './backfillRetryBackoff.js';

describe('calculateBackfillRetryDelayMs（指数バックオフ + Full Jitter・v0.1.442）', () => {
  it('attempt=0 で 0 ≤ delay < base*1=1000ms（rng=0.999 で 1000 未満）', () => {
    const d = calculateBackfillRetryDelayMs(0, { rng: () => 0.999 });
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(1000);
  });

  it('attempt=3 で 0 ≤ delay < base*8=8000ms（rng=0.999 で 8000 未満）', () => {
    const d = calculateBackfillRetryDelayMs(3, { rng: () => 0.999 });
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(8000);
  });

  it('attempt=6 で cap=45000ms 上限（rng=0.999 で 45000 未満）', () => {
    const d = calculateBackfillRetryDelayMs(6, { rng: () => 0.999 });
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(45_000);
  });

  it('attempt=20 のような大きい値でも cap=45000ms を超えない（巨大値耐性）', () => {
    const d = calculateBackfillRetryDelayMs(20, { rng: () => 0.999 });
    expect(d).toBeLessThan(45_000);
  });

  it('rng=() => 0 のとき delay=0（Full Jitter の下限）', () => {
    for (let a = 0; a <= 7; a += 1) {
      expect(calculateBackfillRetryDelayMs(a, { rng: () => 0 })).toBe(0);
    }
  });

  it('rng=() => 0.5 で delay ≈ exponential/2（期待値検証）', () => {
    // attempt=2 → exponential = 1000 * 2^2 = 4000 → 0.5 * 4000 = 2000
    expect(calculateBackfillRetryDelayMs(2, { rng: () => 0.5 })).toBe(2000);
    // attempt=4 → exponential = 1000 * 2^4 = 16000 → 0.5 * 16000 = 8000
    expect(calculateBackfillRetryDelayMs(4, { rng: () => 0.5 })).toBe(8000);
  });

  it('opts で base/cap/factor を上書き可能（カスタム設定）', () => {
    // base=100, factor=3, cap=500 で attempt=2 → 100 * 9 = 900 だが cap=500 で打ち止め
    const d = calculateBackfillRetryDelayMs(2, {
      base: 100,
      cap: 500,
      factor: 3,
      rng: () => 0.5
    });
    expect(d).toBe(250); // 0.5 * 500(=cap)
  });

  it('負数 / NaN / undefined / 文字列 attempt は 0 扱い（rng=0.5 で base/2）', () => {
    const halfBase = DEFAULT_BACKFILL_RETRY_BASE_MS * 0.5;
    expect(calculateBackfillRetryDelayMs(-1, { rng: () => 0.5 })).toBe(halfBase);
    expect(calculateBackfillRetryDelayMs(Number.NaN, { rng: () => 0.5 })).toBe(halfBase);
    expect(calculateBackfillRetryDelayMs(undefined, { rng: () => 0.5 })).toBe(halfBase);
    expect(calculateBackfillRetryDelayMs('foo', { rng: () => 0.5 })).toBe(halfBase);
  });

  it('opts が不正でも安全側で既定値が効く（base=-1 / cap=NaN / factor=0.5 → 全部既定）', () => {
    const d = calculateBackfillRetryDelayMs(2, {
      base: -1,
      cap: Number.NaN,
      factor: 0.5,
      rng: () => 0.5
    });
    // 全部既定（base=1000, cap=45000, factor=2）で attempt=2 → 0.5 * 4000 = 2000
    expect(d).toBe(2000);
  });

  it('既定値の定数が世界標準に合致（base=1000, cap=45000, factor=2）', () => {
    expect(DEFAULT_BACKFILL_RETRY_BASE_MS).toBe(1000);
    expect(DEFAULT_BACKFILL_RETRY_CAP_MS).toBe(45_000);
    expect(DEFAULT_BACKFILL_RETRY_FACTOR).toBe(2);
  });
});
