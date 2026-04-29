/**
 * popup の表示経路で「pending self-post entry（ndgr 観測前の自コメ仮置き）」を
 * 判定するための共通 helper。
 *
 * レイヤ: lib/ (pure)
 *
 * 経緯:
 *   `buildDisplayCommentEntries`（popup-entry.js）が `selfPostedRecentsCache` から
 *   合成 entry を作るとき、id を `pending-self:${lid}:${itemIndex}:${at}` 形式で
 *   発行する。viewer が 184 で投稿した場合、ndgr 観測後の本物 entry.userId は
 *   `a:HASH` 形式（匿名ハッシュ）に切り替わるが、pending 段階では viewerUid
 *   （数値）を仮置きしている。
 *
 * 表示経路では、pending self-post を識別して viewer の数値 ID を露出させない
 * ガードを入れる必要がある（プライバシー保護: スクリーンショット / 画面共有時に
 * 本人の数値 ID が映り込む事故を防ぐ）。
 *
 *   ・Story Detail カード（0.1.9 で対応済み）
 *   ・rank strip / ticker / Growth icon / user rooms（0.1.11 で本 helper に統一）
 */

/**
 * @param {unknown} entry
 * @returns {boolean} `entry?.id` が `'pending-self:'` プレフィックスならば true
 */
export function isPendingSelfPostEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const id = /** @type {{id?: unknown}} */ (entry).id;
  if (typeof id !== 'string') return false;
  return id.startsWith('pending-self:');
}
