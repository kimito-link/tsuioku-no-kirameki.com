/**
 * インライン配置・幅・ビューポート幅・浮遊アンカーの chrome.storage.local 正本まわり。
 * popup-entry の巨大化と保存値の散在による再発を抑えるため、正規化と storage patch を集約する。
 */

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
  INLINE_PANEL_WIDTH_VIDEO,
  normalizeInlinePanelPlacement,
  normalizeInlinePanelWidthMode
} from './storageKeys.js';

/**
 * @typedef {'placement' | 'width_mode' | 'viewport_wide_policy' | 'floating_anchor'} InlinePanelStorageWriteFailureKind
 */

/**
 * @param {InlinePanelStorageWriteFailureKind} kind
 * @returns {string}
 */
export function buildInlinePanelStorageSetFailedMessage(kind) {
  return `inline_panel_${kind}_storage_set_failed`;
}

/**
 * AI 共有診断用: storage.local.get の戻りから popup.storageReadback を組み立てる。
 * @param {Record<string, unknown>} rb
 * @returns {{
 *   placementRaw: unknown,
 *   placementNormalized: ReturnType<typeof normalizeInlinePanelPlacement>,
 *   widthModeRaw: unknown,
 *   widthModeNormalized: ReturnType<typeof normalizeInlinePanelWidthMode>
 * }}
 */
export function buildAiShareInlinePanelStorageReadback(rb) {
  return {
    placementRaw: rb[KEY_INLINE_PANEL_PLACEMENT] ?? null,
    placementNormalized: normalizeInlinePanelPlacement(
      rb[KEY_INLINE_PANEL_PLACEMENT]
    ),
    widthModeRaw: rb[KEY_INLINE_PANEL_WIDTH_MODE] ?? null,
    widthModeNormalized: normalizeInlinePanelWidthMode(
      rb[KEY_INLINE_PANEL_WIDTH_MODE]
    )
  };
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_PANEL_PLACEMENT_BESIDE | typeof INLINE_PANEL_PLACEMENT_FLOATING | typeof INLINE_PANEL_PLACEMENT_DOCK_BOTTOM | typeof INLINE_PANEL_PLACEMENT_BELOW}
 */
export function coerceInlinePanelPlacementForStorage(value) {
  if (value === INLINE_PANEL_PLACEMENT_BESIDE) return INLINE_PANEL_PLACEMENT_BESIDE;
  if (value === INLINE_PANEL_PLACEMENT_FLOATING) return INLINE_PANEL_PLACEMENT_FLOATING;
  if (value === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
  }
  return INLINE_PANEL_PLACEMENT_BELOW;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function storagePatchInlinePanelPlacement(value) {
  return {
    [KEY_INLINE_PANEL_PLACEMENT]: coerceInlinePanelPlacementForStorage(value)
  };
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_PANEL_WIDTH_VIDEO | typeof INLINE_PANEL_WIDTH_PLAYER_ROW}
 */
export function coerceInlinePanelWidthModeForStorage(value) {
  return value === INLINE_PANEL_WIDTH_VIDEO
    ? INLINE_PANEL_WIDTH_VIDEO
    : INLINE_PANEL_WIDTH_PLAYER_ROW;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function storagePatchInlinePanelWidthMode(value) {
  return {
    [KEY_INLINE_PANEL_WIDTH_MODE]: coerceInlinePanelWidthModeForStorage(value)
  };
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_PANEL_VIEWPORT_WIDE_ALWAYS | typeof INLINE_PANEL_VIEWPORT_WIDE_ONCE | typeof INLINE_PANEL_VIEWPORT_WIDE_OFF}
 */
export function coerceInlinePanelViewportWidePolicyForStorage(value) {
  if (value === INLINE_PANEL_VIEWPORT_WIDE_ALWAYS) {
    return INLINE_PANEL_VIEWPORT_WIDE_ALWAYS;
  }
  if (value === INLINE_PANEL_VIEWPORT_WIDE_ONCE) {
    return INLINE_PANEL_VIEWPORT_WIDE_ONCE;
  }
  return INLINE_PANEL_VIEWPORT_WIDE_OFF;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string | boolean>}
 */
export function storagePatchInlinePanelViewportWidePolicy(value) {
  const v = coerceInlinePanelViewportWidePolicyForStorage(value);
  return {
    [KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]: v,
    [KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]: false
  };
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_FLOATING_ANCHOR_BOTTOM_LEFT | typeof INLINE_FLOATING_ANCHOR_TOP_RIGHT}
 */
export function coerceInlineFloatingAnchorForStorage(value) {
  return value === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT
    ? INLINE_FLOATING_ANCHOR_BOTTOM_LEFT
    : INLINE_FLOATING_ANCHOR_TOP_RIGHT;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function storagePatchInlineFloatingAnchor(value) {
  return {
    [KEY_INLINE_FLOATING_ANCHOR]: coerceInlineFloatingAnchorForStorage(value)
  };
}
