/**
 * 新規インストール時のみ、インライン配置キーが未保存なら画面幅で既定を一度書き込む。
 *
 * - background が `install` で pending フラグを立てる（`update` で配置キーが空のときも立てる）
 * - content start で float/below の既存 migrate の後に本関数を呼ぶ
 * - 既に `KEY_INLINE_PANEL_PLACEMENT` が入っているプロファイルでは何もしない（pending だけ下ろす）
 */

import {
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INSTALL_PANEL_PLACEMENT_PENDING
} from './storageKeys.js';
import { suggestInitialInlinePanelPlacement } from './suggestInitialInlinePanelPlacement.js';

/**
 * @param {{
 *   get: (keys: string|string[]) => Promise<Record<string, unknown>>;
 *   set: (o: Record<string, unknown>) => Promise<unknown>;
 *   layoutInnerWidth: number;
 * }} deps
 * @returns {Promise<{ changed: boolean, suggested?: string }>}
 */
export async function migrateSuggestInitialInlinePanelPlacementOnce(deps) {
  const { get, set, layoutInnerWidth } = deps;
  const bag = await get([
    KEY_INSTALL_PANEL_PLACEMENT_PENDING,
    KEY_INLINE_PANEL_PLACEMENT
  ]);
  if (bag[KEY_INSTALL_PANEL_PLACEMENT_PENDING] !== true) {
    return { changed: false };
  }
  const raw = bag[KEY_INLINE_PANEL_PLACEMENT];
  if (raw !== undefined && raw !== null) {
    await set({ [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: false });
    return { changed: false };
  }
  const suggested = suggestInitialInlinePanelPlacement(layoutInnerWidth);
  await set({
    [KEY_INLINE_PANEL_PLACEMENT]: suggested,
    [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: false
  });
  return { changed: true, suggested };
}
