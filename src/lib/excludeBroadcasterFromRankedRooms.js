/**
 * 応援ランクストリップに渡す前に、配信者本人の room を除外する純関数。
 *
 * 設計（0.1.95: 配信者の二重表示 fix）:
 *   応援ランクストリップ末尾には常に「配信者専用カード」が描画される
 *   （popup-entry.js#renderUserRooms で `casterSnap` から組み立て）。
 *   一方、配信者が自分の放送でコメすると aggregateCommentsByUser に
 *   room として集計され、件数によっては rank slot 1〜10 にも入ってしまう。
 *   結果として同じ配信者が strip 内に 2 度表示される。
 *
 *   この helper は rank strip 用 rooms から配信者本人 room だけを除外する。
 *   配信者カードは watchMetaCache.snapshot の broadcaster* フィールドから
 *   別経路で描画されるので、room を捨てても表示情報は失われない。
 *
 *   broadcasterUid 未取得時は no-op（false positive 回避）。
 */

/**
 * @typedef {{ userKey?: unknown, [k: string]: any }} RoomLike
 */

/**
 * @template {RoomLike} T
 * @param {T[]} rooms
 * @param {string} broadcasterUid
 * @returns {T[]}
 */
export function excludeBroadcasterFromRankedRooms(rooms, broadcasterUid) {
  if (!Array.isArray(rooms)) return [];
  const uid = String(broadcasterUid ?? '').trim();
  if (!uid) return rooms.slice();
  return rooms.filter((room) => {
    const userKey = String(room?.userKey ?? '').trim();
    return userKey !== uid;
  });
}
