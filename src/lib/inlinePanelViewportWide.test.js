import { describe, it, expect } from 'vitest';
import {
  resolveViewportRelaxedPanelWidthPx,
  resolveViewportWidePolicyTargetWidthPx,
  resolveWidenedInlinePanelWidthPx,
  shouldConsumeViewportWideOnce,
  suggestPlacementUpgradeForWideViewport,
  shouldConsumePlacementUpgradeOnce
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

describe('suggestPlacementUpgradeForWideViewport', () => {
  const WIDE = INLINE_VIEWPORT_BESIDE_MIN_WIDTH + 40;
  const NARROW = INLINE_VIEWPORT_BESIDE_MIN_WIDTH - 1;
  const base = {
    stored: INLINE_PANEL_PLACEMENT_BELOW,
    userExplicit: false,
    viewportInnerWidth: WIDE,
    policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
    onceDone: false
  };

  it('below + 未明示 + 広い + once 未消費 → beside に昇格', () => {
    expect(suggestPlacementUpgradeForWideViewport(base)).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
  });

  it('未設定（空文字）も昇格対象', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({ ...base, stored: '' })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('always 方針は onceDone に関わらず毎回昇格', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({
        ...base,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: true
      })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('🔥 ユーザー明示選択(USER_EXPLICIT=true)なら絶対に昇格しない', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({ ...base, userExplicit: true })
    ).toBe(null);
    // always でも明示選択が最優先
    expect(
      suggestPlacementUpgradeForWideViewport({
        ...base,
        userExplicit: true,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS
      })
    ).toBe(null);
  });

  it('off 方針なら昇格しない', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({
        ...base,
        policy: INLINE_PANEL_VIEWPORT_WIDE_OFF
      })
    ).toBe(null);
  });

  it('once 方針 + 消費済み(onceDone=true)なら昇格しない', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({ ...base, onceDone: true })
    ).toBe(null);
  });

  it('狭いタブ幅では昇格しない（降格と同じ閾値）', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({
        ...base,
        viewportInnerWidth: NARROW
      })
    ).toBe(null);
  });

  it('閾値ちょうどでは昇格する', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({
        ...base,
        viewportInnerWidth: INLINE_VIEWPORT_BESIDE_MIN_WIDTH
      })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('既に beside / floating / dock_bottom は対象外（昇格しない）', () => {
    for (const stored of [
      INLINE_PANEL_PLACEMENT_BESIDE,
      INLINE_PANEL_PLACEMENT_FLOATING,
      INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
    ]) {
      expect(
        suggestPlacementUpgradeForWideViewport({ ...base, stored })
      ).toBe(null);
    }
  });

  it('viewportInnerWidth が 0 / NaN でも安全（昇格しない）', () => {
    expect(
      suggestPlacementUpgradeForWideViewport({ ...base, viewportInnerWidth: 0 })
    ).toBe(null);
    expect(
      suggestPlacementUpgradeForWideViewport({
        ...base,
        viewportInnerWidth: NaN
      })
    ).toBe(null);
  });

  it('opts 欠落でも throw しない', () => {
    expect(suggestPlacementUpgradeForWideViewport(undefined)).toBe(null);
    expect(suggestPlacementUpgradeForWideViewport({})).toBe(null);
  });

  it.each([
    // [stored, userExplicit, vw, policy, onceDone, expected]
    [INLINE_PANEL_PLACEMENT_BELOW, false, WIDE, 'once', false, INLINE_PANEL_PLACEMENT_BESIDE],
    [INLINE_PANEL_PLACEMENT_BELOW, false, WIDE, 'once', true, null],
    [INLINE_PANEL_PLACEMENT_BELOW, false, WIDE, 'always', true, INLINE_PANEL_PLACEMENT_BESIDE],
    [INLINE_PANEL_PLACEMENT_BELOW, false, NARROW, 'always', false, null],
    [INLINE_PANEL_PLACEMENT_BELOW, true, WIDE, 'always', false, null],
    [INLINE_PANEL_PLACEMENT_DOCK_BOTTOM, false, WIDE, 'always', false, null],
    ['', false, WIDE, 'once', false, INLINE_PANEL_PLACEMENT_BESIDE]
  ])(
    'マトリクス: (%s, explicit=%s, vw=%i, %s, onceDone=%s) → %s',
    (stored, userExplicit, viewportInnerWidth, policy, onceDone, expected) => {
      expect(
        suggestPlacementUpgradeForWideViewport({
          stored,
          userExplicit,
          viewportInnerWidth,
          policy,
          onceDone
        })
      ).toBe(expected);
    }
  );
});

describe('shouldConsumePlacementUpgradeOnce', () => {
  it('once 方針 + 実際に beside へ昇格したときだけ true', () => {
    expect(
      shouldConsumePlacementUpgradeOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        upgradedTo: INLINE_PANEL_PLACEMENT_BESIDE
      })
    ).toBe(true);
  });

  it('always 方針は消費しない（毎回評価し続ける）', () => {
    expect(
      shouldConsumePlacementUpgradeOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        upgradedTo: INLINE_PANEL_PLACEMENT_BESIDE
      })
    ).toBe(false);
  });

  it('昇格しなかった(null)なら消費しない', () => {
    expect(
      shouldConsumePlacementUpgradeOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        upgradedTo: null
      })
    ).toBe(false);
  });

  it('opts 欠落でも false', () => {
    expect(shouldConsumePlacementUpgradeOnce(undefined)).toBe(false);
    expect(shouldConsumePlacementUpgradeOnce({})).toBe(false);
  });
});
