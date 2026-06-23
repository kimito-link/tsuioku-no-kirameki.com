import { describe, it, expect } from 'vitest';
import { isLastWatchUrlFresh, LAST_WATCH_URL_FRESH_MS } from './watchUrlFreshness.js';

describe('LAST_WATCH_URL_FRESH_MS', () => {
  it('3分（180000ms）である', () => {
    expect(LAST_WATCH_URL_FRESH_MS).toBe(180_000);
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
