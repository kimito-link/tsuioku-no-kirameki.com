/**
 * 応援レーンのタイル(story user lane)から「その人の発言一覧」を開くための純関数。
 *
 * 既存経路(popup の応援タイムライン行クリック → comeview.html?user=&uname= → comeview が
 * ?user= を読んで showUserDetail を自動で開く)へタイルを乗せるための橋渡し。DOM/window に
 * 触れない純関数だけをここに置き、DOM 依存(委譲リスナー・chrome.windows.create)は
 * src/extension/popup/wireLaneUserDetailOpen.js に置く(src/lib は window/document 禁止)。
 *
 * 設計正本: docs/handoff/live-comment-body-DESIGN.md 機能A(A1)。
 */

/**
 * comeview のユーザー詳細を開く相対パスを組み立てる。
 * uid・uname は encodeURIComponent 済み(クエリに生の記号を出さない)。
 * comeview 側は ?user=<uid> を comeviewUserKeyForRow({userId:uid}) で 'u:<uid>' に戻す
 * (comeview-entry.js の resolveDetailRequestFromUrl → showUserDetail)ので、
 * ここで渡す uid は 'u:' 接頭辞を外した生 uid(例 '123' や 'a:xyz')。
 * @param {string} uid comeview に渡す生 uid('u:' 接頭辞なし)
 * @param {string} uname 表示名(自動生成の「匿名NNN」は comeview 側で捨てる)
 * @returns {string} 'comeview.html?user=...&uname=...'
 */
export function buildComeviewUserDetailPath(uid, uname) {
  const u = String(uid == null ? '' : uid);
  const n = String(uname == null ? '' : uname);
  return `comeview.html?user=${encodeURIComponent(u)}&uname=${encodeURIComponent(n)}`;
}

/**
 * 応援レーンのタイル(personTileDom / renderStoryUserLaneDom)の
 * data-user-key と title から、comeview へ渡す {uid, uname} を求める。
 *
 * - userKey は venueLaneParityKey の形式。'u:<uid>' なら uid=slice(2)。
 *   'c:...'(広告主等 uid 無しセル)や空・非文字列は発言一覧の対象外=null。
 * - title は personTileDom の tip 形式 `${p.title} | ${fullUid}`(uid 併記時)または `p.title`。
 *   ' | ' で割った先頭を表示名として使う(uid 併記の有無どちらでも先頭が表示名)。
 *
 * @param {{ userKey?: unknown, title?: unknown }} tile
 * @returns {{ uid: string, uname: string }|null}
 */
export function laneTileUserDetailTarget(tile) {
  if (!tile || typeof tile !== 'object') return null;
  const userKey = String(tile.userKey == null ? '' : tile.userKey).trim();
  if (!userKey.startsWith('u:')) return null;
  const uid = userKey.slice(2).trim();
  if (!uid) return null;
  const title = String(tile.title == null ? '' : tile.title);
  const uname = title.split(' | ')[0].trim();
  return { uid, uname };
}

/**
 * comeview / venueBar の発言パネルに出す最大件数。
 * 全件数は見出しに正直に併記するので「切られた」ことは読み手に伝わる(黙って切らない)。
 * 上限を設けるのは、仮想スクロール無しの innerHTML 一括描画で外れ値 1 人にパネルが
 * 数万要素になるのを防ぐ保険(1000字×N件のメモリ・DESIGN §4.3)。
 */
export const USER_SPEECH_ROWS_MAX = 1000;
