/**
 * 配信者アイコン取り違え防止ガード（純粋関数）。
 *
 * 0.1.84 (Phase A refactor):
 *   `extractNiconicoUserIdFromIconUrl` と `isAvatarUrlForUserId` の実装は
 *   src/shared/avatar/avatarUrlGuard.js に移管。
 *   このファイルは re-export shim として残す（既存 import 互換のため）。
 *
 *   `shouldAssociateAvatarWithUser` も近い将来 avatarResolver.isObservationSafe
 *   に置き換え予定（Phase E で deprecated）。
 *
 * 設計（0.1.76: ギフト演出 DOM での avatar 取り違えバグ修正）:
 *   ニコ生のギフト送信演出 UI では、送信者ユーザーの情報行と配信者の
 *   アイコン画像が同じ DOM コンテナ内に並んで描画されることがある。
 *   汎用の avatar harvester がこの行を観測すると、誤って
 *   `interceptedAvatars[viewerUid] = broadcasterIconUrl` を実行してしまう。
 */

import {
  isSameAvatarUrl,
  extractNiconicoUserIdFromIconUrl as _extractNiconicoUserIdFromIconUrl,
  isAvatarUrlForUserId as _isAvatarUrlForUserId
} from '../shared/avatar/avatarUrlGuard.js';

// re-export shim
export const extractNiconicoUserIdFromIconUrl = _extractNiconicoUserIdFromIconUrl;
export const isAvatarUrlForUserId = _isAvatarUrlForUserId;

/**
 * @typedef {Object} AvatarBroadcasterGuardInput
 * @property {unknown} uid                     紐付け対象のユーザー ID
 * @property {unknown} av                      紐付けようとしているアバター URL
 * @property {unknown} [broadcasterUid]        現在の配信者 ユーザー ID（未取得時は空 / null）
 * @property {unknown} [broadcasterIconUrl]    現在の配信者アイコン URL（未取得時は空 / null）
 */

/**
 * uid に av を紐付けてよいか判定する。
 *
 * @deprecated 0.1.84+: 新しいコードからは avatarResolver.isObservationSafe を使う。
 *
 * @param {AvatarBroadcasterGuardInput} input
 * @returns {boolean}
 */
export function shouldAssociateAvatarWithUser(input) {
  const uid = String(input?.uid ?? '').trim();
  const av = String(input?.av ?? '').trim();
  if (!uid || !av) return true;

  const broadcasterUid = String(input?.broadcasterUid ?? '').trim();
  const broadcasterIconUrl = String(input?.broadcasterIconUrl ?? '').trim();

  if (!broadcasterUid) return true;

  const avUidFromUrl = _extractNiconicoUserIdFromIconUrl(av);
  if (avUidFromUrl && avUidFromUrl === broadcasterUid) {
    return uid === broadcasterUid;
  }

  if (broadcasterIconUrl && isSameAvatarUrl(av, broadcasterIconUrl)) {
    return uid === broadcasterUid;
  }

  return true;
}
