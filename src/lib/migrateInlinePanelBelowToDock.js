/**
 * `below` → `dock_bottom` のワンショット移行（0.1.63 AS）。
 *
 * 経緯:
 *   ニコ生の SPA リライト（toi）以降、`renderInlineHostAnchoredToVideo` の
 *   親要素探索（`findFrameInsertAnchorFromVideo`）が「視聴行 + コメント欄 +
 *   バナー一式を含む大きなラッパー」にヒットして、その直後 = description /
 *   Amazon / 関連配信の直前 にパネルが挿入されてしまう問題が発生。
 *   ユーザー証言「前はちゃんと出ていたが、いつからかページ最下部に出る
 *   ようになった」の原因。
 *
 *   `below` を選択しているユーザーを `dock_bottom`（fixed bottom 0）に
 *   ワンショットで移行することで、まずは player と panel が常に viewport
 *   上でセットで見える状態に戻す。`below` を意図して選んでいたユーザーは
 *   設定画面から再度 `below` に切り替えられる（その間に findFrame... の
 *   親選択ロジックを別途修正する）。
 *
 * Service Worker では ESM インポートできないため、extension/background.js
 * に同等ロジックを二重記載している（migrateFloatingInlinePanelToDock と同じ
 * パターン）。
 */

import {
  KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED,
  KEY_INLINE_PANEL_PLACEMENT,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
} from './storageKeys.js';

/**
 * @param {{
 *   get: (keys: string|string[]) => Promise<Record<string, unknown>>;
 *   set: (o: Record<string, unknown>) => Promise<unknown>;
 * }} storage chrome.storage.local 互換
 * @returns {Promise<{ changed: boolean }>}
 */
export async function migrateBelowInlinePanelToDockOnce(storage) {
  const bag = await storage.get([
    KEY_INLINE_PANEL_PLACEMENT,
    KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED
  ]);
  if (bag[KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED] === true) {
    return { changed: false };
  }
  const p = String(bag[KEY_INLINE_PANEL_PLACEMENT] ?? '')
    .trim()
    .toLowerCase();
  if (p !== INLINE_PANEL_PLACEMENT_BELOW) {
    // 既に dock_bottom / floating / beside / 未設定 なら migrate flag だけ立てて終了
    await storage.set({
      [KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]: true
    });
    return { changed: false };
  }
  await storage.set({
    [KEY_INLINE_PANEL_PLACEMENT]: INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
    [KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]: true
  });
  return { changed: true };
}
