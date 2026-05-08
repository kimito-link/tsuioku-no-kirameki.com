import { describe, it, expect } from 'vitest';
import {
  isGiftRankingLaneEnabledFromStorage,
  isGiftRankingLaneEnabledFromChange
} from './giftRankingLaneOptIn.js';
import { KEY_GIFT_RANKING_LANE_ENABLED } from './storageKeys.js';

describe('isGiftRankingLaneEnabledFromStorage', () => {
  it('null / undefined / 空オブジェクトは false（default OFF）', () => {
    expect(isGiftRankingLaneEnabledFromStorage(null)).toBe(false);
    expect(isGiftRankingLaneEnabledFromStorage(undefined)).toBe(false);
    expect(isGiftRankingLaneEnabledFromStorage({})).toBe(false);
  });

  it('true 厳密一致のみ true', () => {
    expect(
      isGiftRankingLaneEnabledFromStorage({ [KEY_GIFT_RANKING_LANE_ENABLED]: true })
    ).toBe(true);
  });

  it('false / 0 / "" / "true" / 1 / null は false（厳密一致防壁）', () => {
    for (const v of [false, 0, '', 'true', 1, null, undefined, {}, []]) {
      expect(
        isGiftRankingLaneEnabledFromStorage({ [KEY_GIFT_RANKING_LANE_ENABLED]: v })
      ).toBe(false);
    }
  });

  it('別 key は無視', () => {
    expect(isGiftRankingLaneEnabledFromStorage({ other_key: true })).toBe(false);
  });

  it('非オブジェクト入力でも crash しない', () => {
    expect(isGiftRankingLaneEnabledFromStorage(/** @type {any} */ ('truthy'))).toBe(false);
    expect(isGiftRankingLaneEnabledFromStorage(/** @type {any} */ (123))).toBe(false);
  });
});

describe('isGiftRankingLaneEnabledFromChange', () => {
  it('newValue=true → true', () => {
    expect(isGiftRankingLaneEnabledFromChange({ newValue: true, oldValue: undefined })).toBe(true);
  });

  it('newValue=false / 未定義 → false', () => {
    expect(isGiftRankingLaneEnabledFromChange({ newValue: false })).toBe(false);
    expect(isGiftRankingLaneEnabledFromChange({ oldValue: true })).toBe(false);
    expect(isGiftRankingLaneEnabledFromChange({})).toBe(false);
    expect(isGiftRankingLaneEnabledFromChange(null)).toBe(false);
  });

  it('newValue が "true" 文字列でも false（型厳格）', () => {
    expect(isGiftRankingLaneEnabledFromChange({ newValue: 'true' })).toBe(false);
  });
});
