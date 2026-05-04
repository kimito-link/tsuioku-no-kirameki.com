import { describe, expect, it } from 'vitest';
import { suggestInitialInlinePanelPlacement } from './suggestInitialInlinePanelPlacement.js';
import {
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
} from './storageKeys.js';

describe('suggestInitialInlinePanelPlacement', () => {
  it('1240px 以上は横付き候補', () => {
    expect(suggestInitialInlinePanelPlacement(1240)).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
    expect(suggestInitialInlinePanelPlacement(1920)).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
  });

  it('960〜1239 はプレイヤー行の下', () => {
    expect(suggestInitialInlinePanelPlacement(1239)).toBe(
      INLINE_PANEL_PLACEMENT_BELOW
    );
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
