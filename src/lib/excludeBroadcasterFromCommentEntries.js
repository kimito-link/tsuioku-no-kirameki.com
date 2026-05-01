/**
 * popup の表示用 comment 配列から、配信者本人 user の comment を除外する純関数。
 *
 * 設計（0.1.100: broadcaster 自コメ除外）:
 *   配信者は自分の放送に対しては「応援される側」で「応援する側」ではない。
 *   配信者本人カードは watchMetaCache.snapshot.broadcaster* から別経路で
 *   描画されるので、popup の story growth grid / comment ticker / lane 集約から
 *   broadcaster の自コメを除外しても表示情報は失われない。
 *
 *   0.1.95 の `excludeBroadcasterFromRankedRooms` は集約 room レベルでの除外
 *   だが、コメ単位 rendering（story growth grid 172 タイル系など）には
 *   届いていなかった。本関数は同じ思想を comment レベルに対応させる。
 *
 *   HTML レポート側 (popup-entry.js:7745 周辺) では既に同じ意味の inline filter
 *   が使われている。本関数は popup display 経路に統一適用するためのヘルパ。
 *
 *   broadcasterUid 未取得時 / userId 不在 entry / 一致しない entry は no-op。
 */

/**
 * @typedef {{ userId?: unknown, [k: string]: any }} CommentEntryLike
 */

/**
 * @template {CommentEntryLike} T
 * @param {T[]} entries
 * @param {string} broadcasterUid
 * @returns {T[]}
 */
export function excludeBroadcasterFromCommentEntries(entries, broadcasterUid) {
  if (!Array.isArray(entries)) return [];
  const uid = String(broadcasterUid ?? '').trim();
  if (!uid) return entries.slice();
  return entries.filter((entry) => {
    const entryUid = String(entry?.userId ?? '').trim();
    return entryUid !== uid;
  });
}
