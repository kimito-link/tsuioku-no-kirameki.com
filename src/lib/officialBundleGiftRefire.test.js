import { describe, it, expect } from 'vitest';
import { shouldRefireOfficialBundleForGift } from './officialBundleGiftRefire.js';

const MIN = 5000;

describe('shouldRefireOfficialBundleForGift', () => {
  it('初回 / リセット直後（lastAt=0）は即発火', () => {
    expect(shouldRefireOfficialBundleForGift(1_000_000, 0, MIN)).toBe(true);
  });

  it('lastAt 未設定（-Infinity / NaN）も初回扱いで発火', () => {
    expect(
      shouldRefireOfficialBundleForGift(1_000_000, -Infinity, MIN)
    ).toBe(true);
    expect(shouldRefireOfficialBundleForGift(1_000_000, NaN, MIN)).toBe(true);
  });

  it('minInterval 未満は抑制（throttle）', () => {
    const last = 1_000_000;
    expect(
      shouldRefireOfficialBundleForGift(last + 4_999, last, MIN)
    ).toBe(false);
    expect(shouldRefireOfficialBundleForGift(last + 1, last, MIN)).toBe(false);
  });

  it('ちょうど minInterval 経過（境界）は発火可', () => {
    const last = 1_000_000;
    expect(shouldRefireOfficialBundleForGift(last + MIN, last, MIN)).toBe(true);
  });

  it('minInterval 超過は発火', () => {
    const last = 1_000_000;
    expect(
      shouldRefireOfficialBundleForGift(last + 8_000, last, MIN)
    ).toBe(true);
  });

  it('now が非有限なら安全側＝発火しない', () => {
    expect(shouldRefireOfficialBundleForGift(NaN, 1000, MIN)).toBe(false);
    expect(
      shouldRefireOfficialBundleForGift(Infinity, 1000, MIN)
    ).toBe(false);
    expect(
      shouldRefireOfficialBundleForGift(undefined, 1000, MIN)
    ).toBe(false);
  });

  it('minInterval 不正は 0 扱い（last>0 なら経過ゼロでも発火）', () => {
    const last = 1_000_000;
    expect(shouldRefireOfficialBundleForGift(last, last, NaN)).toBe(true);
    expect(shouldRefireOfficialBundleForGift(last, last, -10)).toBe(true);
  });

  it('gift storm シミュレーション: 100 件/3s で発火は ceil(window/min) 以下', () => {
    let last = 0;
    let fires = 0;
    const start = 2_000_000;
    for (let i = 0; i < 100; i += 1) {
      const now = start + Math.floor((i / 100) * 3000); // 3秒間に100件
      if (shouldRefireOfficialBundleForGift(now, last, MIN)) {
        fires += 1;
        last = now;
      }
    }
    // 3s 窓 + 初回 → 高々 1（初回のみ、以降は 5s throttle で抑制）
    expect(fires).toBeLessThanOrEqual(1);
  });

  it('liveId 切替で lastAt=0 にリセットされれば直後の gift は即発火', () => {
    const last = 9_000_000; // 直前放送で発火済
    // 切替前: throttle 内なら抑制
    expect(
      shouldRefireOfficialBundleForGift(last + 100, last, MIN)
    ).toBe(false);
    // 切替で lastAt=0 リセット後: 即発火
    expect(shouldRefireOfficialBundleForGift(last + 100, 0, MIN)).toBe(true);
  });
});
