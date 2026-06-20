/**
 * broadcasterCommentCount.js — 「配信者本人のコメント数」を正しく算出する純関数(v0.1.838)。
 *
 * 背景(記録0表示バグ・実機 lv350789652): popup-entry.js は配信者ぶんを見出しから引くために
 * `_broadcasterCount = countToShow - displayEntriesBase.length` と算出していた。だが countToShow は
 * `max(summaryRecordedCount, entries)` で、summaryRecordedCount(記録総数)が entries より大きいと
 * その差を全部「配信者コメント」と誤読する。小規模/ロード中/匿名で entries が未生成だと
 * 差=記録総数 → 全部引かれて見出しが 0 に潰れる(displayEntriesBase は配信者を既に除外済なのに二重計上)。
 *
 * 正しくは「配信者除外フィルタで実際に取り除かれた件数」=除外前 entries 数 − 除外後 entries 数。
 * これは summaryRecordedCount(別ソースの総数)とは無関係。記録総数の多寡で勝手に増えない。
 * 設計正本=council/recorded-count-zero-bug.md。副作用なし。
 *
 * @param {number} preExcludeLen   配信者除外【前】の表示エントリ数
 * @param {number} postExcludeLen  配信者除外【後】の表示エントリ数
 * @returns {number} 実際に除外された配信者コメント数(0 以上・preExcludeLen を超えない)
 */
export function resolveBroadcasterCommentCount(preExcludeLen, postExcludeLen) {
  const pre = Number.isFinite(preExcludeLen) ? Math.max(0, Math.floor(preExcludeLen)) : 0;
  const post = Number.isFinite(postExcludeLen) ? Math.max(0, Math.floor(postExcludeLen)) : 0;
  // 除外で減った分だけが配信者コメント。負(増える)はあり得ないので 0 下限。
  return Math.max(0, pre - post);
}
