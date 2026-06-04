import { describe, it, expect } from 'vitest';
import {
  shouldRearmBackfillAfterVisibility,
  pruneRecentVisibilityPauses,
  VISIBILITY_REARM_WINDOW_MS,
  VISIBILITY_REARM_MAX_PAUSES_IN_WINDOW
} from './backfillVisibilityRearm.js';

describe('shouldRearmBackfillAfterVisibility — 初回保証', () => {
  it('🔴退行根治: この liveId でまだ一度も rearm していなければ常に許可する（開いた直後の沈黙を作らない）', () => {
    // 連発カウンタがどれだけ溜まっていても、初回はかならず再開する。
    expect(
      shouldRearmBackfillAfterVisibility({
        hasRearmedThisLive: false,
        recentPauseTimestamps: [1, 2, 3, 4, 5, 6]
      })
    ).toBe(true);
  });

  it('初回保証は recentPauseTimestamps が空でも許可する', () => {
    expect(
      shouldRearmBackfillAfterVisibility({
        hasRearmedThisLive: false,
        recentPauseTimestamps: []
      })
    ).toBe(true);
  });
});

describe('shouldRearmBackfillAfterVisibility — 発火回数ベース抑制（2 回目以降）', () => {
  const onceRearmed = { hasRearmedThisLive: true };

  it('単発の hidden（窓内 1 回）は即再開を許可する', () => {
    expect(
      shouldRearmBackfillAfterVisibility({ ...onceRearmed, recentPauseTimestamps: [1000] })
    ).toBe(true);
  });

  it('窓内 2 回（閾値 3 未満）も即再開を許可する', () => {
    expect(
      shouldRearmBackfillAfterVisibility({
        ...onceRearmed,
        recentPauseTimestamps: [1000, 1200]
      })
    ).toBe(true);
  });

  it('窓内 3 回（閾値以上＝連発ループ）は抑制する', () => {
    expect(
      shouldRearmBackfillAfterVisibility({
        ...onceRearmed,
        recentPauseTimestamps: [1000, 1100, 1200]
      })
    ).toBe(false);
  });

  it('maxPausesInWindow を上書きできる', () => {
    expect(
      shouldRearmBackfillAfterVisibility({
        ...onceRearmed,
        recentPauseTimestamps: [1000, 1100],
        maxPausesInWindow: 2
      })
    ).toBe(false);
  });

  it('既定閾値は VISIBILITY_REARM_MAX_PAUSES_IN_WINDOW（3）', () => {
    expect(VISIBILITY_REARM_MAX_PAUSES_IN_WINDOW).toBe(3);
  });
});

describe('pruneRecentVisibilityPauses', () => {
  it('観測窓内のタイムスタンプだけ残す', () => {
    const now = 10_000;
    // now-8000=2000 が境界。厳密 < なので 2000 ちょうど（経過 8000ms）は窓外で落ちる。
    const kept = pruneRecentVisibilityPauses([500, 2000, 2001, 5000, 9999], now);
    expect(kept).toEqual([2001, 5000, 9999]);
  });

  it('境界（ちょうど windowMs 前）は窓外として落とす（厳密 <）', () => {
    const now = 10_000;
    const kept = pruneRecentVisibilityPauses([now - VISIBILITY_REARM_WINDOW_MS], now);
    expect(kept).toEqual([]);
  });

  it('数値でない値や不正な now は安全に空配列', () => {
    expect(pruneRecentVisibilityPauses(['x', null, NaN], 1000)).toEqual([]);
    expect(pruneRecentVisibilityPauses([1000], NaN)).toEqual([]);
    expect(pruneRecentVisibilityPauses(null, 1000)).toEqual([]);
  });

  it('連発を間引いた後の配列を shouldRearm に渡すと、連発ループだけ抑制できる（結合シナリオ）', () => {
    const now = 10_000;
    // 直近 8 秒に 4 回連発 → 間引いても 3 件以上残る → 抑制。
    const recent = pruneRecentVisibilityPauses([3000, 5000, 7000, 9000], now);
    expect(recent.length).toBeGreaterThanOrEqual(3);
    expect(
      shouldRearmBackfillAfterVisibility({
        hasRearmedThisLive: true,
        recentPauseTimestamps: recent
      })
    ).toBe(false);
    // 古い連発が窓外に出れば（now が進む）再開が戻る。
    const later = pruneRecentVisibilityPauses([3000, 5000, 7000, 9000], 16_000);
    expect(later.length).toBeLessThan(3);
    expect(
      shouldRearmBackfillAfterVisibility({
        hasRearmedThisLive: true,
        recentPauseTimestamps: later
      })
    ).toBe(true);
  });
});
