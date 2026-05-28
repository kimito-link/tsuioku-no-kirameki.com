import { describe, it, expect } from 'vitest';
import { shouldCloseStandalonePopupAfterNavigate } from './standalonePopupClose.js';

describe('shouldCloseStandalonePopupAfterNavigate', () => {
  it('standalone popup（type=popup・非inline・タブ開けた）は閉じる', () => {
    expect(
      shouldCloseStandalonePopupAfterNavigate({
        inlineMode: false,
        windowType: 'popup',
        openedStreamTab: true
      })
    ).toBe(true);
  });

  it('openedStreamTab 省略でも type=popup・非inline なら閉じる', () => {
    expect(
      shouldCloseStandalonePopupAfterNavigate({ inlineMode: false, windowType: 'popup' })
    ).toBe(true);
  });

  it('インライン（iframe 埋め込み）は絶対に閉じない', () => {
    expect(
      shouldCloseStandalonePopupAfterNavigate({
        inlineMode: true,
        windowType: 'popup',
        openedStreamTab: true
      })
    ).toBe(false);
  });

  it('通常タブ表示（type=normal）は閉じない', () => {
    expect(
      shouldCloseStandalonePopupAfterNavigate({
        inlineMode: false,
        windowType: 'normal',
        openedStreamTab: true
      })
    ).toBe(false);
  });

  it('タブを開けなかった（openedStreamTab=false）なら閉じない', () => {
    expect(
      shouldCloseStandalonePopupAfterNavigate({
        inlineMode: false,
        windowType: 'popup',
        openedStreamTab: false
      })
    ).toBe(false);
  });

  it('windowType 不明/未指定なら閉じない（安全側）', () => {
    expect(
      shouldCloseStandalonePopupAfterNavigate({ inlineMode: false, windowType: undefined })
    ).toBe(false);
    expect(
      shouldCloseStandalonePopupAfterNavigate({ inlineMode: false })
    ).toBe(false);
  });

  it('不正入力は false', () => {
    expect(shouldCloseStandalonePopupAfterNavigate(null)).toBe(false);
    expect(shouldCloseStandalonePopupAfterNavigate(undefined)).toBe(false);
  });
});
