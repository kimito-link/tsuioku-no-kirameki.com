import { describe, it, expect } from 'vitest';
import {
  isBackfillEnabledFromStorage,
  isBackfillJustEnabledFromChange
} from './backfillOptIn.js';
import { KEY_BACKFILL_ENABLED } from './storageKeys.js';

describe('isBackfillEnabledFromStorage', () => {
  it('true 厳密一致のときだけ true', () => {
    expect(isBackfillEnabledFromStorage({ [KEY_BACKFILL_ENABLED]: true })).toBe(true);
  });

  it('未設定 / 不正値 / null / undefined はすべて false（default OFF）', () => {
    expect(isBackfillEnabledFromStorage({})).toBe(false);
    expect(isBackfillEnabledFromStorage(null)).toBe(false);
    expect(isBackfillEnabledFromStorage(undefined)).toBe(false);
    for (const v of ['true', 1, {}, [], 'yes']) {
      expect(isBackfillEnabledFromStorage({ [KEY_BACKFILL_ENABLED]: v })).toBe(false);
    }
  });
});

describe('isBackfillJustEnabledFromChange', () => {
  it('false → true の立ち上がりエッジで true', () => {
    expect(isBackfillJustEnabledFromChange({ newValue: true, oldValue: false })).toBe(true);
    expect(isBackfillJustEnabledFromChange({ newValue: true, oldValue: undefined })).toBe(true);
  });

  it('true → true（既に ON）では false（再巡回を防ぐ）', () => {
    expect(isBackfillJustEnabledFromChange({ newValue: true, oldValue: true })).toBe(false);
  });

  it('true 以外への変更 / 不正入力は false', () => {
    expect(isBackfillJustEnabledFromChange({ newValue: false, oldValue: true })).toBe(false);
    expect(isBackfillJustEnabledFromChange({ newValue: 'true', oldValue: false })).toBe(false);
    expect(isBackfillJustEnabledFromChange(null)).toBe(false);
    expect(isBackfillJustEnabledFromChange(undefined)).toBe(false);
  });
});
