/**
 * 新規インストール直後の「おすすめ」インライン配置（storage 未設定時のみ migrate が使う）。
 * 既存ユーザーの値は上書きしない。
 *
 * 横付きの可否閾値は `effectiveInlinePanelPlacement` と同じ `INLINE_VIEWPORT_BESIDE_MIN_WIDTH`
 * に揃える（1240 専用だと 1200〜1239 が「下」になり、大画面でも横付きにならない）。
 */

import { INLINE_VIEWPORT_BESIDE_MIN_WIDTH } from './inlinePanelLayout.js';
import {
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
} from './storageKeys.js';

/**
 * @param {number} layoutInnerWidth レイアウト用のタブ幅（CSS px）。`window.innerWidth` 相当を渡すこと。
 * @returns {typeof INLINE_PANEL_PLACEMENT_BESIDE | typeof INLINE_PANEL_PLACEMENT_BELOW | typeof INLINE_PANEL_PLACEMENT_DOCK_BOTTOM}
 */
export function suggestInitialInlinePanelPlacement(layoutInnerWidth) {
  const w = Number(layoutInnerWidth) || 0;
  if (w >= INLINE_VIEWPORT_BESIDE_MIN_WIDTH) return INLINE_PANEL_PLACEMENT_BESIDE;
  if (w >= 960) return INLINE_PANEL_PLACEMENT_BELOW;
  return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
}
