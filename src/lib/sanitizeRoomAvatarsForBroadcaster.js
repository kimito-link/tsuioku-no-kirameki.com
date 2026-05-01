/**
 * 集計済み user room の avatarUrl から「broadcaster icon の取り違え」を除去する純粋関数。
 *
 * 設計（0.1.78: コメ記録に既に焼き込まれた汚染 avatar の表示時補正）:
 *   0.1.76 で interceptedAvatars への broadcaster icon 紐付けを止め、
 *   0.1.77 で resolveUserEntryAvatarSignals 入力 3 ソースにガードを掛けたが、
 *   それ以前のバージョンで chrome.storage.local の `nls_comments_<liveId>` に
 *   既に焼き込まれた avatarUrl は補正されない。
 *
 *   aggregateCommentsByUser は user 別の「最新コメ時刻の avatarUrl」を採用する
 *   仕様のため、過去の汚染レコードの avatar が出続けてしまう。本関数は popup
 *   表示前のチョークポイントで「room.avatarUrl が現在の broadcaster icon と
 *   一致するなら、その room の userKey が broadcaster 本人でない限り空にする」
 *   後処理を行う。空にすれば呼び出し側が canonical fallback で正しい viewer
 *   icon を組み立てる。
 *
 *   他の場所のガードと違って、これは「観測された汚染データの撤去」が目的なので、
 *   broadcaster 情報未取得時もガードを掛けない（false positive 回避）原則は同じ。
 *
 * 0.1.97: uid 抽出ベースに強化
 *   旧 0.1.78 ロジックは `isSameAvatarUrl` で URL 文字列一致を見ていたが、
 *   broadcaster icon が `/s/` / `/uri150x150/` / `/m/` などサイズ違いで
 *   storage に焼き込まれていると一致せず、stripped されない問題があった
 *   (lv350429771 で実機確認: ID 未取得の room に broadcaster icon が乗ったまま
 *    rank strip 1 番目に表示)。
 *   URL から niconico uid を抽出し、broadcasterUid と一致するかで判定すれば
 *   サイズ違い・query 違いに関係なく検出できる。URL 文字列一致は fallback として残す。
 */

import { isSameAvatarUrl } from './avatarUrlCompare.js';
import { extractNiconicoUserIdFromIconUrl } from '../shared/avatar/avatarUrlGuard.js';

/**
 * @typedef {Object} SanitizeRoomAvatarsContext
 * @property {string} broadcasterUid       現在の配信者 ユーザー ID（空なら no-op）
 * @property {string} broadcasterIconUrl   現在の配信者アイコン URL（空なら no-op）
 */

/**
 * @typedef {{ userKey?: unknown, avatarUrl?: unknown, [k: string]: any }} UserRoomLike
 */

/**
 * 1 件の room を補正する純粋関数。
 *
 * @template {UserRoomLike} T
 * @param {T} room
 * @param {SanitizeRoomAvatarsContext} ctx
 * @returns {T} 汚染なら avatarUrl を '' にした新オブジェクト、それ以外は入力をそのまま返す
 */
export function sanitizeRoomAvatarForBroadcaster(room, ctx) {
  if (!room || typeof room !== 'object') return room;
  const av = String(room.avatarUrl ?? '').trim();
  if (!av) return room;
  const broadcasterUid = String(ctx?.broadcasterUid ?? '').trim();
  const broadcasterIconUrl = String(ctx?.broadcasterIconUrl ?? '').trim();
  if (!broadcasterUid || !broadcasterIconUrl) return room;
  const userKey = String(room.userKey ?? '').trim();
  // broadcaster 本人 room はそのまま通す
  if (userKey === broadcasterUid) return room;

  // 0.1.97: uid 抽出ベースの contamination 検出（サイズ違い対応）
  //   av の URL から niconico uid を抽出し broadcasterUid と一致するなら
  //   汚染とみなす。`/s/` / `/uri150x150/` / `/m/` などサイズ違いも検出可。
  const avUid = extractNiconicoUserIdFromIconUrl(av);
  if (avUid && avUid === broadcasterUid) {
    return { ...room, avatarUrl: '' };
  }

  // fallback: 0.1.78 の URL 文字列一致（uid を含まない非標準 URL の保険）
  if (!isSameAvatarUrl(av, broadcasterIconUrl)) return room;
  return { ...room, avatarUrl: '' };
}

/**
 * room 配列を補正する純粋関数。
 *
 * @template {UserRoomLike} T
 * @param {T[]} rooms
 * @param {SanitizeRoomAvatarsContext} ctx
 * @returns {T[]}
 */
export function sanitizeRoomAvatarsForBroadcaster(rooms, ctx) {
  if (!Array.isArray(rooms)) return [];
  return rooms.map((r) => sanitizeRoomAvatarForBroadcaster(r, ctx));
}
