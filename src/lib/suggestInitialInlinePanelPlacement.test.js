import { describe, expect, it } from 'vitest';
import { INLINE_VIEWPORT_BESIDE_MIN_WIDTH } from './inlinePanelLayout.js';
import { suggestInitialInlinePanelPlacement } from './suggestInitialInlinePanelPlacement.js';
import {
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
} from './storageKeys.js';

describe('suggestInitialInlinePanelPlacement', () => {
  it('INLINE_VIEWPORT_BESIDE_MIN_WIDTH 以上は横付き候補（実効配置と閾値一致）', () => {
    expect(
      suggestInitialInlinePanelPlacement(INLINE_VIEWPORT_BESIDE_MIN_WIDTH)
    ).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(suggestInitialInlinePanelPlacement(1920)).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
  });

  it('960〜(閾値-1) はプレイヤー行の下', () => {
    expect(
      suggestInitialInlinePanelPlacement(INLINE_VIEWPORT_BESIDE_MIN_WIDTH - 1)
    ).toBe(INLINE_PANEL_PLACEMENT_BELOW);
    expect(suggestInitialInlinePanelPlacement(960)).toBe(
      INLINE_PANEL_PLACEMENT_BELOW
    );
  });

  it('959 以下は画面下いっぱい', () => {
    expect(suggestInitialInlinePanelPlacement(959)).toBe(
      INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
    );
    expect(suggestInitialInlinePanelPlacement(0)).toBe(
      INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
    );
  });
});
