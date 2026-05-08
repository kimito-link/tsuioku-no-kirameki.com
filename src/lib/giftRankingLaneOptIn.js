/**
 * v0.1.228: ギフトランキングレーンの opt-in 判定 純関数群。
 *
 * 役割:
 *   - chrome.storage.local の `KEY_GIFT_RANKING_LANE_ENABLED` 値の解釈を
 *     1 箇所に集約（true 厳密一致 + 未設定/不正値 = OFF default）。
 *   - 副作用なし、storage.local 自体は触らない（呼び出し側が get/set する）。
 *
 * 経緯（v0.1.226 / v0.1.227 の実機観測）:
 *   - 配信者ごとに公式サイドバー iframe の Vue が rich-view-status placeholder
 *     のまま render に到達しないケースが多い。
 *   - 取得試行（autoOpen → サイドバー一瞬オープン）の副作用で
 *     「お困りの方はこちら」rescue link が表示され UX を損ねる。
 *   - 初期 OFF にして、ユーザーが明示的にボタンを押したときだけ取得開始する。
 */

import { KEY_GIFT_RANKING_LANE_ENABLED } from './storageKeys.js';

/**
 * chrome.storage.local.get の戻り値（または同形 Object）から opt-in 状態を
 * boolean で返す。default OFF（未設定 / 不正値 / null / undefined すべて false）。
 *
 * @param {Record<string, unknown>|null|undefined} bag
 * @returns {boolean}
 */
export function isGiftRankingLaneEnabledFromStorage(bag) {
  if (!bag || typeof bag !== 'object') return false;
  return bag[KEY_GIFT_RANKING_LANE_ENABLED] === true;
}

/**
 * chrome.storage の単一 key 用 helper（content-entry.js 起動時の即時判定用）。
 * onChanged listener の入力（StorageChange）でも使える。
 *
 * @param {{ newValue?: unknown, oldValue?: unknown }|null|undefined} change
 * @returns {boolean}
 */
export function isGiftRankingLaneEnabledFromChange(change) {
  if (!change || typeof change !== 'object') return false;
  return change.newValue === true;
}
