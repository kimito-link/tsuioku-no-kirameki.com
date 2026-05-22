import { describe, it, expect } from 'vitest';
import {
  INLINE_PANEL_DEFAULT_PLACEMENTS,
  isDefaultInlinePanelPlacement,
  resolveWideViewportPlacementUpgrade,
  shouldConsumeWideViewportUpgradeOnce,
  resolveInlinePanelPlacementDecision
} from './inlinePanelPlacementResolver.js';
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

const WIDE = INLINE_VIEWPORT_BESIDE_MIN_WIDTH + 40;
const NARROW = INLINE_VIEWPORT_BESIDE_MIN_WIDTH - 1;

describe('INLINE_PANEL_DEFAULT_PLACEMENTS / isDefaultInlinePanelPlacement', () => {
  it('既定配置は below / dock_bottom / 未設定（floating・beside は意図選択なので含めない）', () => {
    expect(INLINE_PANEL_DEFAULT_PLACEMENTS).toContain('');
    expect(INLINE_PANEL_DEFAULT_PLACEMENTS).toContain(INLINE_PANEL_PLACEMENT_BELOW);
    expect(INLINE_PANEL_DEFAULT_PLACEMENTS).toContain(
      INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
    );
    expect(INLINE_PANEL_DEFAULT_PLACEMENTS).not.toContain(
      INLINE_PANEL_PLACEMENT_FLOATING
    );
    expect(INLINE_PANEL_DEFAULT_PLACEMENTS).not.toContain(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
  });

  it('凍結されている（不変の単一の真実）', () => {
    expect(Object.isFrozen(INLINE_PANEL_DEFAULT_PLACEMENTS)).toBe(true);
  });

  it.each([
    ['', true],
    [INLINE_PANEL_PLACEMENT_BELOW, true],
    [INLINE_PANEL_PLACEMENT_DOCK_BOTTOM, true],
    [INLINE_PANEL_PLACEMENT_FLOATING, false],
    [INLINE_PANEL_PLACEMENT_BESIDE, false],
    [null, true],
    [undefined, true],
    ['  below  ', true],
    ['garbage', false]
  ])('isDefaultInlinePanelPlacement(%s) → %s', (stored, expected) => {
    expect(isDefaultInlinePanelPlacement(stored)).toBe(expected);
  });
});

describe('resolveWideViewportPlacementUpgrade', () => {
  const base = {
    stored: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
    userExplicit: false,
    viewportInnerWidth: WIDE,
    policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
    onceDone: false
  };

  it('🐛 dock_bottom（実質の既定）を大画面で beside に昇格（本バグの修正点）', () => {
    expect(resolveWideViewportPlacementUpgrade(base)).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
  });

  it('below / 未設定 も昇格', () => {
    expect(
      resolveWideViewportPlacementUpgrade({
        ...base,
        stored: INLINE_PANEL_PLACEMENT_BELOW
      })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(
      resolveWideViewportPlacementUpgrade({ ...base, stored: '' })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('USER_EXPLICIT=true は dock でも below でも昇格しない（意思尊重）', () => {
    expect(
      resolveWideViewportPlacementUpgrade({ ...base, userExplicit: true })
    ).toBe(null);
  });

  it('floating は既定でない＝昇格しない', () => {
    expect(
      resolveWideViewportPlacementUpgrade({
        ...base,
        stored: INLINE_PANEL_PLACEMENT_FLOATING
      })
    ).toBe(null);
  });

  it('狭いタブ幅では昇格しない / off では昇格しない / once 消費済みは昇格しない', () => {
    expect(
      resolveWideViewportPlacementUpgrade({ ...base, viewportInnerWidth: NARROW })
    ).toBe(null);
    expect(
      resolveWideViewportPlacementUpgrade({
        ...base,
        policy: INLINE_PANEL_VIEWPORT_WIDE_OFF
      })
    ).toBe(null);
    expect(
      resolveWideViewportPlacementUpgrade({ ...base, onceDone: true })
    ).toBe(null);
  });

  it('always は onceDone に関わらず昇格', () => {
    expect(
      resolveWideViewportPlacementUpgrade({
        ...base,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        onceDone: true
      })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('opts 欠落でも throw しない', () => {
    expect(resolveWideViewportPlacementUpgrade(undefined)).toBe(null);
    expect(resolveWideViewportPlacementUpgrade({})).toBe(null);
  });
});

describe('shouldConsumeWideViewportUpgradeOnce', () => {
  it('once + 実際に beside 昇格のときだけ true', () => {
    expect(
      shouldConsumeWideViewportUpgradeOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        upgradedTo: INLINE_PANEL_PLACEMENT_BESIDE
      })
    ).toBe(true);
    expect(
      shouldConsumeWideViewportUpgradeOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
        upgradedTo: INLINE_PANEL_PLACEMENT_BESIDE
      })
    ).toBe(false);
    expect(
      shouldConsumeWideViewportUpgradeOnce({
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        upgradedTo: null
      })
    ).toBe(false);
  });
});

describe('resolveInlinePanelPlacementDecision（昇格＋降格の総合解決）', () => {
  it('dock_bottom を大画面で開く → 昇格 beside・実効 beside・once 消費', () => {
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
      userExplicit: false,
      viewportInnerWidth: WIDE,
      policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
      onceDone: false
    });
    expect(d.upgradeTo).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(d.nextStored).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(d.consumeOnce).toBe(true);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('昇格しても実効は降格ロジックを通る（境界以下なら below に落ちる）', () => {
    // 幅が昇格閾値以上だが、effectiveInlinePanelPlacement の降格境界（同値）で
    // ちょうど beside を維持するケース。NARROW では昇格自体が起きない。
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
      userExplicit: false,
      viewportInnerWidth: INLINE_VIEWPORT_BESIDE_MIN_WIDTH,
      policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
      onceDone: false
    });
    expect(d.upgradeTo).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('昇格なし(USER_EXPLICIT dock)→ 据え置き・実効は dock_bottom', () => {
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
      userExplicit: true,
      viewportInnerWidth: WIDE,
      policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
      onceDone: false
    });
    expect(d.upgradeTo).toBe(null);
    expect(d.nextStored).toBe(INLINE_PANEL_PLACEMENT_DOCK_BOTTOM);
    expect(d.consumeOnce).toBe(false);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_DOCK_BOTTOM);
  });

  it('明示 beside だが狭い → 昇格なし・実効は降格で below', () => {
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_BESIDE,
      userExplicit: true,
      viewportInnerWidth: NARROW,
      policy: INLINE_PANEL_VIEWPORT_WIDE_OFF,
      onceDone: false
    });
    expect(d.upgradeTo).toBe(null);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_BELOW);
  });

  it('opts 欠落でも安全', () => {
    const d = resolveInlinePanelPlacementDecision(undefined);
    expect(d.upgradeTo).toBe(null);
    expect(d.consumeOnce).toBe(false);
  });
});
