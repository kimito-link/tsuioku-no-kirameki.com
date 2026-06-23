import { describe, it, expect } from 'vitest';
import { isBackgroundWatchTab } from './backgroundWatchTab.js';

describe('isBackgroundWatchTab', () => {
  it('active:false かつ有効な tabId なら true(裏タブ＝提示すべき)', () => {
    expect(isBackgroundWatchTab({ active: false, tabId: 42 })).toBe(true);
    expect(isBackgroundWatchTab({ active: false, tabId: 0 })).toBe(true);
  });

  it('active:true(前面で見ている)は false(手動視聴を誤爆しない)', () => {
    expect(isBackgroundWatchTab({ active: true, tabId: 42 })).toBe(false);
  });

  it('active が不明(undefined)は false(安全側＝提示しない)', () => {
    expect(isBackgroundWatchTab({ tabId: 42 })).toBe(false);
    expect(isBackgroundWatchTab({ active: undefined, tabId: 42 })).toBe(false);
  });

  it('tabId が無効なら false(閉じる対象にできない)', () => {
    expect(isBackgroundWatchTab({ active: false })).toBe(false);
    expect(isBackgroundWatchTab({ active: false, tabId: NaN })).toBe(false);
    expect(isBackgroundWatchTab({ active: false, tabId: -1 })).toBe(false);
    expect(isBackgroundWatchTab({ active: false, tabId: 'x' })).toBe(false);
  });

  it('null/undefined/非オブジェクトは false', () => {
    expect(isBackgroundWatchTab(null)).toBe(false);
    expect(isBackgroundWatchTab(undefined)).toBe(false);
    expect(isBackgroundWatchTab(42)).toBe(false);
    expect(isBackgroundWatchTab('x')).toBe(false);
  });

  it('active が false 以外の falsy(0/null)でも提示しない(=== false のみ)', () => {
    expect(isBackgroundWatchTab({ active: 0, tabId: 42 })).toBe(false);
    expect(isBackgroundWatchTab({ active: null, tabId: 42 })).toBe(false);
  });
});
