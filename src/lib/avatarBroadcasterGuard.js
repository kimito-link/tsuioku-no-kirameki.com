/**
 * 配信者アイコン取り違え防止ガード（純粋関数）。
 *
 * 設計（0.1.76: ギフト演出 DOM での avatar 取り違えバグ修正）:
 *   ニコ生のギフト送信演出 UI では、送信者ユーザーの情報行と配信者の
 *   アイコン画像が同じ DOM コンテナ内に並んで描画されることがある。
 *   汎用の avatar harvester がこの行を観測すると、誤って
 *   `interceptedAvatars[viewerUid] = broadcasterIconUrl` を実行してしまい、
 *   以降ずっとその viewer のアバターに配信者アイコンが返される。
 *
 *   本関数は「ある uid に av を紐付けてよいか」を判定する純粋関数で、
 *   - av が現在の broadcasterIconUrl と一致する
 *   - かつ uid が broadcaster 本人の uid ではない
 *   というケースだけ false を返す。それ以外は true（紐付け OK）。
 *
 *   broadcaster 情報が未取得（snapshot 未確定 / channel 配信で URL 不明等）の
 *   ときはガードを掛けない（false negative より false positive を避ける）。
 */

import { isSameAvatarUrl } from './avatarUrlCompare.js';

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
 * @param {AvatarBroadcasterGuardInput} input
 * @returns {boolean}
 *   - true:  紐付けて良い（broadcaster 情報未取得 / 別アバター / uid が broadcaster 本人）
 *   - false: 紐付けてはいけない（broadcaster 以外の uid に broadcaster アイコンを紐付けようとしている）
 */
export function shouldAssociateAvatarWithUser(input) {
  const uid = String(input?.uid ?? '').trim();
  const av = String(input?.av ?? '').trim();
  // 入力欠損時は呼び出し元の判断に委ねる（ガード対象外）
  if (!uid || !av) return true;

  const broadcasterUid = String(input?.broadcasterUid ?? '').trim();
  const broadcasterIconUrl = String(input?.broadcasterIconUrl ?? '').trim();

  // broadcaster 情報が未取得 → ガード掛けず通す
  if (!broadcasterUid || !broadcasterIconUrl) return true;

  // av が broadcaster icon と一致するなら、uid が broadcaster 本人の場合のみ許可
  if (isSameAvatarUrl(av, broadcasterIconUrl)) {
    return uid === broadcasterUid;
  }

  return true;
}
