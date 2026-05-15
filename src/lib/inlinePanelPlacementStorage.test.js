import { describe, expect, it } from 'vitest';
import {
  buildAiShareInlinePanelStorageReadback,
  buildInlinePanelStorageSetFailedMessage,
  coerceInlineFloatingAnchorForStorage,
  coerceInlinePanelPlacementForStorage,
  coerceInlinePanelViewportWidePolicyForStorage,
  coerceInlinePanelWidthModeForStorage,
  storagePatchInlineFloatingAnchor,
  storagePatchInlinePanelPlacement,
  storagePatchInlinePanelViewportWidePolicy,
  storagePatchInlinePanelWidthMode
} from './inlinePanelPlacementStorage.js';
import {
  KEY_INLINE_FLOATING_ANCHOR,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_PANEL_WIDTH_MODE,
  INLINE_FLOATING_ANCHOR_BOTTOM_LEFT,
  INLINE_FLOATING_ANCHOR_TOP_RIGHT,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  INLINE_PANEL_PLACEMENT_FLOATING,
  INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
  INLINE_PANEL_VIEWPORT_WIDE_OFF,
  INLINE_PANEL_VIEWPORT_WIDE_ONCE,
  INLINE_PANEL_WIDTH_PLAYER_ROW,
  INLINE_PANEL_WIDTH_VIDEO
} from './storageKeys.js';

describe('inlinePanelPlacementStorage', () => {
  it('buildInlinePanelStorageSetFailedMessage', () => {
    expect(buildInlinePanelStorageSetFailedMessage('placement')).toBe(
      'inline_panel_placement_storage_set_failed'
    );
  });

  it('buildAiShareInlinePanelStorageReadback', () => {
    const rb = {
      [KEY_INLINE_PANEL_PLACEMENT]: '  BESIDE  ',
      [KEY_INLINE_PANEL_WIDTH_MODE]: 'video'
    };
    expect(buildAiShareInlinePanelStorageReadback(rb)).toEqual({
      placementRaw: '  BESIDE  ',
      placementNormalized: INLINE_PANEL_PLACEMENT_BESIDE,
      widthModeRaw: 'video',
      widthModeNormalized: INLINE_PANEL_WIDTH_VIDEO
    });
  });

  it('coerceInlinePanelPlacementForStorage', () => {
    expect(coerceInlinePanelPlacementForStorage(INLINE_PANEL_PLACEMENT_BESIDE)).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
    expect(coerceInlinePanelPlacementForStorage('beside')).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
    expect(coerceInlinePanelPlacementForStorage(undefined)).toBe(
      INLINE_PANEL_PLACEMENT_BELOW
    );
    expect(coerceInlinePanelPlacementForStorage('unknown-placement')).toBe(
      INLINE_PANEL_PLACEMENT_BELOW
    );
  });

  it('storagePatchInlinePanelPlacement', () => {
    expect(storagePatchInlinePanelPlacement(INLINE_PANEL_PLACEMENT_DOCK_BOTTOM)).toEqual(
      { [KEY_INLINE_PANEL_PLACEMENT]: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM }
    );
  });

  it('coerceInlinePanelWidthModeForStorage', () => {
    expect(coerceInlinePanelWidthModeForStorage(INLINE_PANEL_WIDTH_VIDEO)).toBe(
      INLINE_PANEL_WIDTH_VIDEO
    );
    expect(coerceInlinePanelWidthModeForStorage('garbage')).toBe(
      INLINE_PANEL_WIDTH_PLAYER_ROW
    );
  });

  it('storagePatchInlinePanelWidthMode', () => {
    expect(storagePatchInlinePanelWidthMode(INLINE_PANEL_WIDTH_VIDEO)).toEqual({
      [KEY_INLINE_PANEL_WIDTH_MODE]: INLINE_PANEL_WIDTH_VIDEO
    });
  });

  it('coerceInlinePanelViewportWidePolicyForStorage', () => {
    expect(coerceInlinePanelViewportWidePolicyForStorage(INLINE_PANEL_VIEWPORT_WIDE_ALWAYS)).toBe(
      INLINE_PANEL_VIEWPORT_WIDE_ALWAYS
    );
    expect(coerceInlinePanelViewportWidePolicyForStorage(INLINE_PANEL_VIEWPORT_WIDE_ONCE)).toBe(
      INLINE_PANEL_VIEWPORT_WIDE_ONCE
    );
    expect(coerceInlinePanelViewportWidePolicyForStorage('x')).toBe(
      INLINE_PANEL_VIEWPORT_WIDE_OFF
    );
  });

  it('storagePatchInlinePanelViewportWidePolicy', () => {
    expect(storagePatchInlinePanelViewportWidePolicy(INLINE_PANEL_VIEWPORT_WIDE_ONCE)).toEqual({
      [KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]: INLINE_PANEL_VIEWPORT_WIDE_ONCE,
      [KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]: false
    });
  });

  it('coerceInlineFloatingAnchorForStorage', () => {
    expect(coerceInlineFloatingAnchorForStorage(INLINE_FLOATING_ANCHOR_BOTTOM_LEFT)).toBe(
      INLINE_FLOATING_ANCHOR_BOTTOM_LEFT
    );
    expect(coerceInlineFloatingAnchorForStorage(undefined)).toBe(
      INLINE_FLOATING_ANCHOR_TOP_RIGHT
    );
  });

  it('storagePatchInlineFloatingAnchor', () => {
    expect(storagePatchInlineFloatingAnchor(INLINE_FLOATING_ANCHOR_TOP_RIGHT)).toEqual({
      [KEY_INLINE_FLOATING_ANCHOR]: INLINE_FLOATING_ANCHOR_TOP_RIGHT
    });
  });
});
