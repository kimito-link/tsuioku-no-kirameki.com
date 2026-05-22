import { describe, it, expect } from 'vitest';
import {
  INLINE_PANEL_DEFAULT_PLACEMENTS,
  isDefaultInlinePanelPlacement,
  resolveWideViewportPlacementUpgrade,
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
    // 🐛 v0.1.301: onceDone は配置昇格をブロックしない（幅広げ機能との共有フラグ
    // 誤ブロックの撤去）。once 方針で onceDone=true でも昇格する。
    expect(
      resolveWideViewportPlacementUpgrade({ ...base, onceDone: true })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('🐛 共有 once フラグ撤去: once + onceDone=true でも昇格（実機 below 固定の主因）', () => {
    // 過去セッションで「幅広げ once」が消費され onceDone=true でも、配置昇格は別物。
    expect(
      resolveWideViewportPlacementUpgrade({
        stored: INLINE_PANEL_PLACEMENT_BELOW,
        userExplicit: false,
        viewportInnerWidth: 1257,
        policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
        onceDone: true
      })
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('always も onceDone に関わらず昇格', () => {
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

describe('resolveInlinePanelPlacementDecision（昇格＋降格の総合解決）', () => {
  it('dock_bottom を大画面で開く → 昇格 beside・実効 beside', () => {
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
      userExplicit: false,
      viewportInnerWidth: WIDE,
      policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE
    });
    expect(d.upgradeTo).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(d.nextStored).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('🐛 実機再現: below + 非明示 + 1257px → beside（onceDone を渡しても）', () => {
    // 診断バンドル lv350583010 の実値。修正前はここが below のままだった。
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_BELOW,
      userExplicit: false,
      viewportInnerWidth: 1257,
      policy: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
      onceDone: true
    });
    expect(d.upgradeTo).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
  });

  it('昇格なし(USER_EXPLICIT dock)→ 据え置き・実効は dock_bottom', () => {
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
      userExplicit: true,
      viewportInnerWidth: WIDE,
      policy: INLINE_PANEL_VIEWPORT_WIDE_ALWAYS
    });
    expect(d.upgradeTo).toBe(null);
    expect(d.nextStored).toBe(INLINE_PANEL_PLACEMENT_DOCK_BOTTOM);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_DOCK_BOTTOM);
  });

  it('明示 beside だが狭い → 昇格なし・実効は降格で below', () => {
    const d = resolveInlinePanelPlacementDecision({
      stored: INLINE_PANEL_PLACEMENT_BESIDE,
      userExplicit: true,
      viewportInnerWidth: NARROW,
      policy: INLINE_PANEL_VIEWPORT_WIDE_OFF
    });
    expect(d.upgradeTo).toBe(null);
    expect(d.effective).toBe(INLINE_PANEL_PLACEMENT_BELOW);
  });

  it('opts 欠落でも安全', () => {
    const d = resolveInlinePanelPlacementDecision(undefined);
    expect(d.upgradeTo).toBe(null);
  });
});
