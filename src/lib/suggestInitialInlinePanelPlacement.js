/**
 * 新規インストール直後の「おすすめ」インライン配置（storage 未設定時のみ migrate が使う）。
 * 既存ユーザーの値は上書きしない。
 */

import {
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
} from './storageKeys.js';

/**
 * @param {number} layoutInnerWidth window.innerWidth 相当（CSS px）
 * @returns {typeof INLINE_PANEL_PLACEMENT_BESIDE | typeof INLINE_PANEL_PLACEMENT_BELOW | typeof INLINE_PANEL_PLACEMENT_DOCK_BOTTOM}
 */
export function suggestInitialInlinePanelPlacement(layoutInnerWidth) {
  const w = Number(layoutInnerWidth) || 0;
  if (w >= 1240) return INLINE_PANEL_PLACEMENT_BESIDE;
  if (w >= 960) return INLINE_PANEL_PLACEMENT_BELOW;
  return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
}
