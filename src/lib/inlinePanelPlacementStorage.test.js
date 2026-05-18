import { describe, expect, it } from 'vitest';
import {
  buildAiShareInlinePanelStorageReadback,
  buildInlinePanelStorageSetFailedMessage,
  coerceInlineFloatingAnchorForStorage,
  coerceInlinePanelPlacementForStorage,
  coerceInlinePanelViewportWidePolicyForStorage,
  coerceInlinePanelWidthModeForStorage,
  isInlinePanelPlacementWriteVerified,
  storagePatchInlineFloatingAnchor,
  storagePatchInlinePanelPlacement,
  storagePatchInlinePanelPlacementWithExplicit,
  storagePatchInlinePanelViewportWidePolicy,
  storagePatchInlinePanelWidthMode
} from './inlinePanelPlacementStorage.js';
import {
  KEY_INLINE_FLOATING_ANCHOR,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_PANEL_WIDTH_MODE,
  INLINE_FLOATING_ANCHOR_BOTTOM_LEFT,
  INLINE_FLOATING_ANCHOR_TOP_RIGHT,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
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

  it('storagePatchInlinePanelPlacementWithExplicit は配置キーと明示フラグを同時に書く', () => {
    expect(
      storagePatchInlinePanelPlacementWithExplicit(INLINE_PANEL_PLACEMENT_BESIDE)
    ).toEqual({
      [KEY_INLINE_PANEL_PLACEMENT]: INLINE_PANEL_PLACEMENT_BESIDE,
      [KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT]: true
    });
    // coerce も従来どおり効く（未知値は below）
    expect(storagePatchInlinePanelPlacementWithExplicit('garbage')).toEqual({
      [KEY_INLINE_PANEL_PLACEMENT]: INLINE_PANEL_PLACEMENT_BELOW,
      [KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT]: true
    });
  });

  it('isInlinePanelPlacementWriteVerified は読み戻し一致のみ true', () => {
    expect(
      isInlinePanelPlacementWriteVerified(
        { [KEY_INLINE_PANEL_PLACEMENT]: 'beside' },
        INLINE_PANEL_PLACEMENT_BESIDE
      )
    ).toBe(true);
    // 保存されず旧 below が残っている＝検証不一致（横付きにしたのに戻る事象）
    expect(
      isInlinePanelPlacementWriteVerified(
        { [KEY_INLINE_PANEL_PLACEMENT]: 'below' },
        INLINE_PANEL_PLACEMENT_BESIDE
      )
    ).toBe(false);
    // 前後空白付きでも normalize で一致
    expect(
      isInlinePanelPlacementWriteVerified(
        { [KEY_INLINE_PANEL_PLACEMENT]: '  BESIDE  ' },
        INLINE_PANEL_PLACEMENT_BESIDE
      )
    ).toBe(true);
    // 読み戻し不能（null / 非オブジェクト）は不一致扱い（intended=beside vs 既定 below）
    expect(isInlinePanelPlacementWriteVerified(null, INLINE_PANEL_PLACEMENT_BESIDE)).toBe(
      false
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
