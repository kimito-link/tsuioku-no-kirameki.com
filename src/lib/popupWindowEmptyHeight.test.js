import { describe, expect, it } from 'vitest';
import {
  computePopupWindowTargetHeight,
  POPUP_WINDOW_WIDTH,
  POPUP_WINDOW_HEIGHT_ACTIVE_WATCH,
  POPUP_WINDOW_HEIGHT_EMPTY_WITH_HISTORY,
  POPUP_WINDOW_HEIGHT_EMPTY_NO_HISTORY,
  POPUP_WINDOW_MIN_HEIGHT,
  POPUP_WINDOW_MAX_HEIGHT
} from './popupWindowEmptyHeight.js';

describe('popupWindowEmptyHeight constants', () => {
  it('幅は 420 で固定（既存の background.js と整合）', () => {
    expect(POPUP_WINDOW_WIDTH).toBe(420);
  });

  it('active watch の高さは 780（0.1.58 以降の既定）', () => {
    expect(POPUP_WINDOW_HEIGHT_ACTIVE_WATCH).toBe(780);
  });

  it('empty + history の高さは active より低く、no-history より高い', () => {
    expect(POPUP_WINDOW_HEIGHT_EMPTY_WITH_HISTORY).toBeLessThan(
      POPUP_WINDOW_HEIGHT_ACTIVE_WATCH
    );
    expect(POPUP_WINDOW_HEIGHT_EMPTY_WITH_HISTORY).toBeGreaterThan(
      POPUP_WINDOW_HEIGHT_EMPTY_NO_HISTORY
    );
  });

  it('min / max 範囲は妥当', () => {
    expect(POPUP_WINDOW_MIN_HEIGHT).toBeGreaterThan(0);
    expect(POPUP_WINDOW_MIN_HEIGHT).toBeLessThanOrEqual(
      POPUP_WINDOW_HEIGHT_EMPTY_NO_HISTORY
    );
    expect(POPUP_WINDOW_MAX_HEIGHT).toBeGreaterThanOrEqual(
      POPUP_WINDOW_HEIGHT_ACTIVE_WATCH
    );
  });
});

describe('computePopupWindowTargetHeight', () => {
  it('emptyState=false なら active watch の高さ（780）', () => {
    expect(
      computePopupWindowTargetHeight({ emptyState: false, hasHistory: false })
    ).toBe(POPUP_WINDOW_HEIGHT_ACTIVE_WATCH);
    expect(
      computePopupWindowTargetHeight({ emptyState: false, hasHistory: true })
    ).toBe(POPUP_WINDOW_HEIGHT_ACTIVE_WATCH);
  });

  it('emptyState=true で hasHistory=true なら empty+history の高さ', () => {
    expect(
      computePopupWindowTargetHeight({ emptyState: true, hasHistory: true })
    ).toBe(POPUP_WINDOW_HEIGHT_EMPTY_WITH_HISTORY);
  });

  it('emptyState=true で hasHistory=false なら empty+no-history の高さ', () => {
    expect(
      computePopupWindowTargetHeight({ emptyState: true, hasHistory: false })
    ).toBe(POPUP_WINDOW_HEIGHT_EMPTY_NO_HISTORY);
  });

  it('引数欠損時はデフォルトに倒す（emptyState=false 扱い）', () => {
    expect(computePopupWindowTargetHeight({})).toBe(
      POPUP_WINDOW_HEIGHT_ACTIVE_WATCH
    );
    expect(computePopupWindowTargetHeight()).toBe(
      POPUP_WINDOW_HEIGHT_ACTIVE_WATCH
    );
  });

  it('明示的な viewportHint を受けると content + chrome の合計を返す', () => {
    // Chrome window のタイトルバー込みなので content + 40 を上限の中で返す。
    // 範囲内なら content + chrome を返す。
    const out = computePopupWindowTargetHeight({
      emptyState: true,
      hasHistory: true,
      viewportHint: { contentHeightPx: 500, chromeOverheadPx: 40 }
    });
    expect(out).toBe(540);
  });

  it('viewportHint が極端に小さい場合は MIN にクランプ', () => {
    const out = computePopupWindowTargetHeight({
      emptyState: true,
      hasHistory: false,
      viewportHint: { contentHeightPx: 50, chromeOverheadPx: 40 }
    });
    expect(out).toBe(POPUP_WINDOW_MIN_HEIGHT);
  });

  it('viewportHint が極端に大きい場合は MAX にクランプ', () => {
    const out = computePopupWindowTargetHeight({
      emptyState: false,
      viewportHint: { contentHeightPx: 5000, chromeOverheadPx: 40 }
    });
    expect(out).toBe(POPUP_WINDOW_MAX_HEIGHT);
  });

  it('viewportHint の数値が NaN/負数なら無視してプリセットを使う', () => {
    const out = computePopupWindowTargetHeight({
      emptyState: true,
      hasHistory: true,
      viewportHint: { contentHeightPx: NaN, chromeOverheadPx: -5 }
    });
    expect(out).toBe(POPUP_WINDOW_HEIGHT_EMPTY_WITH_HISTORY);
  });
});
