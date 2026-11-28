/**
 * marketingExportGate.js — マーケHTMLのボタンを押せるかの理由。v0.1.2265
 *   配信が決まっていないとき、またはコメントが0件と分かっているときは押せない。
 *   まだ件数が分からないあいだは、配信 id があれば押せる(読み込み中に一度消して点滅させない)。
 */

/**
 * @param {{ liveId?: unknown, commentCount?: unknown, commentsKnown?: unknown }} p
 * @returns {string} 空なら押せる。理由があれば押せない。
 */
export function marketingExportDisabledReason(p = {}) {
  if (!String(p.liveId || '').trim()) return '配信が決まっていません';
  if (p.commentsKnown === true && !(Number(p.commentCount) > 0)) return 'コメントが0件です。';
  return '';
}
