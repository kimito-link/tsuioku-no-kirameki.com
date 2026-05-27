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

import { KEY_BACKFILL_ENABLED, KEY_BACKFILL_AUTO_DISABLED } from './storageKeys.js';

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

/**
 * v0.1.418: 過去ログの「自動開始」が有効か（既定 ON）。
 * `KEY_BACKFILL_AUTO_DISABLED === true` のときだけ false（ユーザーが自動を OFF にした）。
 * 未設定 / 不正値 / null は ON（true）＝配信を開いて記録 ON なら勝手に取り込む。
 *
 * @param {Record<string, unknown>|null|undefined} bag
 * @returns {boolean}
 */
export function isBackfillAutoStartEnabled(bag) {
  if (!bag || typeof bag !== 'object') return true;
  return bag[KEY_BACKFILL_AUTO_DISABLED] !== true;
}

/**
 * storage.onChanged の単一 StorageChange から「自動開始が今回 ON に変わったか」を返す。
 * `KEY_BACKFILL_AUTO_DISABLED` が true→false（または true→未設定）になった立ち上がり。
 * ユーザーが設定で「自動取り込み」を ON に戻した瞬間に巡回を起動するため。
 *
 * @param {{ newValue?: unknown, oldValue?: unknown }|null|undefined} change
 * @returns {boolean}
 */
export function isBackfillAutoJustEnabledFromChange(change) {
  if (!change || typeof change !== 'object') return false;
  return change.oldValue === true && change.newValue !== true;
}
