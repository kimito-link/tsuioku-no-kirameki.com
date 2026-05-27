import { describe, it, expect } from 'vitest';
import {
  isBackfillEnabledFromStorage,
  isBackfillJustEnabledFromChange,
  isBackfillAutoStartEnabled,
  isBackfillAutoJustEnabledFromChange
} from './backfillOptIn.js';
import { KEY_BACKFILL_ENABLED, KEY_BACKFILL_AUTO_DISABLED } from './storageKeys.js';

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

// v0.1.418: 自動開始（既定 ON・OFF にもできる）。
describe('isBackfillAutoStartEnabled', () => {
  it('未設定 / null / undefined は ON（既定で勝手に取り込む）', () => {
    expect(isBackfillAutoStartEnabled({})).toBe(true);
    expect(isBackfillAutoStartEnabled(null)).toBe(true);
    expect(isBackfillAutoStartEnabled(undefined)).toBe(true);
  });

  it('KEY_BACKFILL_AUTO_DISABLED === true のときだけ OFF', () => {
    expect(isBackfillAutoStartEnabled({ [KEY_BACKFILL_AUTO_DISABLED]: true })).toBe(false);
  });

  it('true 以外（false / 不正値）は ON のまま（明示 OFF だけ尊重）', () => {
    expect(isBackfillAutoStartEnabled({ [KEY_BACKFILL_AUTO_DISABLED]: false })).toBe(true);
    for (const v of ['true', 1, {}, [], 'yes', 0]) {
      expect(isBackfillAutoStartEnabled({ [KEY_BACKFILL_AUTO_DISABLED]: v })).toBe(true);
    }
  });
});

describe('isBackfillAutoJustEnabledFromChange', () => {
  it('disabled が true→false（自動を ON に戻した）立ち上がりで true', () => {
    expect(isBackfillAutoJustEnabledFromChange({ oldValue: true, newValue: false })).toBe(true);
    expect(isBackfillAutoJustEnabledFromChange({ oldValue: true, newValue: undefined })).toBe(true);
  });

  it('disabled が false→true（自動を OFF にした）では false', () => {
    expect(isBackfillAutoJustEnabledFromChange({ oldValue: false, newValue: true })).toBe(false);
  });

  it('不正入力は false', () => {
    expect(isBackfillAutoJustEnabledFromChange(null)).toBe(false);
    expect(isBackfillAutoJustEnabledFromChange(undefined)).toBe(false);
  });
});
