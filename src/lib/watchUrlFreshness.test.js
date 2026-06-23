import { describe, it, expect } from 'vitest';
import {
  isLastWatchUrlFresh,
  isEpochFresh,
  LAST_WATCH_URL_FRESH_MS
} from './watchUrlFreshness.js';

describe('LAST_WATCH_URL_FRESH_MS', () => {
  it('3分（180000ms）である', () => {
    expect(LAST_WATCH_URL_FRESH_MS).toBe(180_000);
  });
});

describe('isEpochFresh(汎用)', () => {
  const now = 1_000_000_000;

  it('maxAge 以内なら true（境界含む）', () => {
    expect(isEpochFresh(now - 1000, now, 5000)).toBe(true);
    expect(isEpochFresh(now - 5000, now, 5000)).toBe(true);
  });

  it('maxAge より古ければ false', () => {
    expect(isEpochFresh(now - 5001, now, 5000)).toBe(false);
  });

  it('capturedAt が無い/壊れているなら false', () => {
    expect(isEpochFresh(null, now, 5000)).toBe(false);
    expect(isEpochFresh(undefined, now, 5000)).toBe(false);
    expect(isEpochFresh(NaN, now, 5000)).toBe(false);
    expect(isEpochFresh(-1, now, 5000)).toBe(false);
  });

  it('nowMs が壊れていれば false', () => {
    expect(isEpochFresh(now, null, 5000)).toBe(false);
    expect(isEpochFresh(now, undefined, 5000)).toBe(false);
    expect(isEpochFresh(now, NaN, 5000)).toBe(false);
  });

  it('maxAgeMs が不正(0/負/NaN)なら false（呼び出し側が既定を決める責務）', () => {
    expect(isEpochFresh(now, now, 0)).toBe(false);
    expect(isEpochFresh(now, now, -5)).toBe(false);
    expect(isEpochFresh(now, now, NaN)).toBe(false);
  });

  it('未来の capturedAt（時計ずれ）は古くないので true', () => {
    expect(isEpochFresh(now + 5000, now, 5000)).toBe(true);
  });
});

describe('isLastWatchUrlFresh', () => {
  const now = 1_000_000_000;

  it('しきい値以内に更新されていれば true（視聴中として採用）', () => {
    expect(isLastWatchUrlFresh(now - 1000, now)).toBe(true);
    expect(isLastWatchUrlFresh(now - (LAST_WATCH_URL_FRESH_MS - 1), now)).toBe(true);
  });

  it('ちょうどしきい値（境界）は採用する', () => {
    expect(isLastWatchUrlFresh(now - LAST_WATCH_URL_FRESH_MS, now)).toBe(true);
  });

  it('しきい値より古ければ false（死んだタブの記録は視聴中に出さない）', () => {
    expect(isLastWatchUrlFresh(now - (LAST_WATCH_URL_FRESH_MS + 1), now)).toBe(false);
    expect(isLastWatchUrlFresh(now - 60 * 60 * 1000, now)).toBe(false);
  });

  it('updatedAt が無い/壊れている（サマリ不在）なら false（記録の形跡なし＝視聴中でない）', () => {
    expect(isLastWatchUrlFresh(null, now)).toBe(false);
    expect(isLastWatchUrlFresh(undefined, now)).toBe(false);
    expect(isLastWatchUrlFresh(NaN, now)).toBe(false);
    expect(isLastWatchUrlFresh('not-a-number', now)).toBe(false);
    expect(isLastWatchUrlFresh(-1, now)).toBe(false);
  });

  it('nowMs が壊れていれば false（安全側）', () => {
    expect(isLastWatchUrlFresh(now, NaN)).toBe(false);
    expect(isLastWatchUrlFresh(now, null)).toBe(false);
  });

  it('未来の updatedAt（時計ずれ）は古くないので採用する', () => {
    expect(isLastWatchUrlFresh(now + 5000, now)).toBe(true);
  });

  it('maxAgeMs を明示できる（不正値は既定にフォールバック）', () => {
    expect(isLastWatchUrlFresh(now - 5000, now, 1000)).toBe(false);
    expect(isLastWatchUrlFresh(now - 500, now, 1000)).toBe(true);
    // 不正な maxAgeMs は既定（3分）にフォールバック
    expect(isLastWatchUrlFresh(now - 1000, now, 0)).toBe(true);
    expect(isLastWatchUrlFresh(now - 1000, now, -5)).toBe(true);
  });
});
