import { describe, it, expect } from 'vitest';
import {
  resolveViewportRelaxedPanelWidthPx,
  resolveViewportWidePolicyTargetWidthPx,
  resolveWidenedInlinePanelWidthPx,
  shouldConsumeViewportWideOnce,
  suggestPlacementUpgradeForWideViewport
} from './inlinePanelViewportWide.js';
import { INLINE_VIEWPORT_BESIDE_MIN_WIDTH } from './inlinePanelLayout.js';
import {
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  INLINE_PANEL_PLACEMENT_FLOATING,
  INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
  INLINE_PANEL_VIEWPORT_WIDE_OFF,
  INLINE_PANEL_VIEWPORT_WIDE_ONCE
} from './storageKeys.js';

describe('resolveViewportRelaxedPanelWidthPx', () => {
  it('body フォールバック用（720 キャップ・320 下限・24 引き）', () => {
    expect(resolveViewportRelaxedPanelWidthPx(1920)).toBe(720);
    expect(resolveViewportRelaxedPanelWidthPx(800)).toBe(720);
    expect(resolveViewportRelaxedPanelWidthPx(400)).toBe(376);
    expect(resolveViewportRelaxedPanelWidthPx(340)).toBe(320);
    expect(resolveViewportRelaxedPanelWidthPx(300)).toBe(320);
    expect(resolveViewportRelaxedPanelWidthPx(0)).toBe(320);
  });
});

describe('resolveViewportWidePolicyTargetWidthPx', () => {
  it('タブ幅−24 を基準にし超ワイドは 1920 で頭打ち', () => {
    expect(resolveViewportWidePolicyTargetWidthPx(1400)).toBe(1376);
    expect(resolveViewportWidePolicyTargetWidthPx(1600)).toBe(1576);
    expect(resolveViewportWidePolicyTargetWidthPx(3000)).toBe(1920);
    expect(resolveViewportWidePolicyTargetWidthPx(340)).toBe(320);
  });
});

describe('resolveWidenedInlinePanelWidthPx', () => {
  it('floating / dock は基準幅のまま', () => {
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 400,
        viewportInnerWidth: 1600,
        placement: INLINE_PANEL_PLACEMENT_FLOATING,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: false
      })
    ).toBe(400);
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 400,
        viewportInnerWidth: 1600,
        placement: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: false
      })
    ).toBe(400);
  });

  it('off は基準幅', () => {
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 400,
        viewportInnerWidth: 1600,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        policy: INLINE_PANEL_VIEWPORT_WIDE_OFF,
        onceDone: false
      })
    ).toBe(400);
  });

  it('always は max(基準, タブ幅ベース)', () => {
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 400,
        viewportInnerWidth: 1600,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: false
      })
    ).toBe(1576);
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 2000,
        viewportInnerWidth: 2000,
        placement: INLINE_PANEL_PLACEMENT_BESIDE,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: false
      })
    ).toBe(2000);
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 900,
        viewportInnerWidth: 3000,
        placement: INLINE_PANEL_PLACEMENT_BESIDE,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: false
      })
    ).toBe(1920);
  });

  it('once かつ消費済みは基準幅', () => {
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 400,
        viewportInnerWidth: 1600,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        onceDone: true
      })
    ).toBe(400);
  });

  it('once 未消費は always と同じ拡張', () => {
    expect(
      resolveWidenedInlinePanelWidthPx({
        baselineWidthPx: 400,
        viewportInnerWidth: 1600,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        onceDone: false
      })
    ).toBe(1576);
  });
});

describe('shouldConsumeViewportWideOnce', () => {
  it('once・可視・below/beside のときだけ true', () => {
    expect(
      shouldConsumeViewportWideOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        onceDone: false,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        documentVisibilityState: 'visible'
      })
    ).toBe(true);
    expect(
      shouldConsumeViewportWideOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        onceDone: false,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        documentVisibilityState: 'hidden'
      })
    ).toBe(false);
    expect(
      shouldConsumeViewportWideOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        onceDone: true,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        documentVisibilityState: 'visible'
      })
    ).toBe(false);
    expect(
      shouldConsumeViewportWideOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: false,
        placement: INLINE_PANEL_PLACEMENT_BELOW,
        documentVisibilityState: 'visible'
      })
    ).toBe(false);
  });
});


// 横付き昇格ロジックの本体テストは inlinePanelPlacementResolver.test.js に集約。
// ここでは「再エクスポートの別名が resolver へ正しく繋がっているか」だけ確認する。
describe('suggestPlacementUpgradeForWideViewport（resolver への別名）', () => {
  it('別名が機能している（below + 非明示 + 広い → beside）', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({
        stored: INLINE_PANEL_PLACEMENT_BELOW,
        userExplicit: false,
        viewportInnerWidth: INLINE_VIEWPORT_BESIDE_MIN_WIDTH + 40,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE
      })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });
});
