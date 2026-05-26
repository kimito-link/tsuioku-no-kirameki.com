/**
 * v0.1.405: 過去ログ一括バックフィル（NDGR backward 巡回）の opt-in 判定 純関数群。
 *
 * 役割:
 *   - chrome.storage.local の `KEY_BACKFILL_ENABLED` 値の解釈を 1 箇所に集約
 *     （true 厳密一致 + 未設定/不正値 = OFF default）。
 *   - 副作用なし、storage.local 自体は触らない（呼び出し側が get/set する）。
 *
 * 設計（2026-05-27 会議室で確定）:
 *   - backfill は連続 fetch（cross-origin・throttle つき）を伴うため初期 OFF。
 *   - ⚠️ ギフトランキングレーンと違い「フラグ」ではなく「1 回のアクション」として
 *     扱う（フラグが立ちっぱなしだと SPA 遷移のたびに再巡回してしまう）。呼び出し側
 *     が `_backfillTriedLiveId` でワンショット化する責務を持つ。本関数は「今 ON か」
 *     を返すだけ。
 *
 * @module backfillOptIn
 */

import { KEY_BACKFILL_ENABLED } from './storageKeys.js';

/**
 * chrome.storage.local.get の戻り値（または同形 Object）から opt-in 状態を boolean
 * で返す。default OFF（未設定 / 不正値 / null / undefined すべて false）。
 *
 * @param {Record<string, unknown>|null|undefined} bag
 * @returns {boolean}
 */
export function isBackfillEnabledFromStorage(bag) {
  if (!bag || typeof bag !== 'object') return false;
  return bag[KEY_BACKFILL_ENABLED] === true;
}

/**
 * storage.onChanged の単一 StorageChange から「今回 true に変わったか」を返す。
 * false → true の立ち上がりエッジ判定（OFF→ON でだけ巡回を起動するため）。
 *
 * @param {{ newValue?: unknown, oldValue?: unknown }|null|undefined} change
 * @returns {boolean}
 */
export function isBackfillJustEnabledFromChange(change) {
  if (!change || typeof change !== 'object') return false;
  return change.newValue === true && change.oldValue !== true;
}
