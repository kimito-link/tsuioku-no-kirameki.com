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

/**
 * v0.1.2265: 2つのマーケボタン(クイック・内訳の中)へ同じ理由を当てる。内訳(details)が閉じていても毎回の描画で呼ぶ。
 *   件数が分かっているのは、コメント配列を読めたとき(storage_ok / fallback_cached / summary)と commentsKnown のとき。
 * @param {Document} doc
 * @param {{ liveId?: unknown, displayCount?: unknown, storageCount?: unknown, commentReadState?: unknown, commentsKnown?: unknown }} p
 */
export function applyMarketingExportGate(doc, p = {}) {
  const rs = p.commentReadState;
  let commentCount = Number(p.displayCount) || Number(p.storageCount) || 0;
  let commentsKnown = p.commentsKnown === true || rs === 'storage_ok' || rs === 'fallback_cached' || rs === 'summary';
  // 動画のパネル(YouTube・ニコ動など)は、コメント欄をまだ読んでいないだけで記録が0件のことがある。
  //   0件と言ってよいのは、ページに出ている総数(「コメント 0 件」)が0のときだけ(プレミア公開前・コメント無効など)。
  if (doc?.documentElement?.getAttribute?.('data-nl-video-watch') === '1') {
    const facts = String(doc.querySelector?.('.nlsb-video-watch-card__facts')?.textContent || '');
    const total = facts.match(/コメント\s*([\d,]+)\s*件/);
    commentsKnown = !!total;
    if (total) commentCount = Number(total[1].replace(/,/g, '')) || 0;
  }
  const reason = marketingExportDisabledReason({ liveId: p.liveId, commentCount, commentsKnown });
  for (const id of ['devMonitorExportMarketingBtn', 'exportMarketingQuickBtn']) {
    const b = /** @type {HTMLButtonElement | null} */ (doc?.getElementById?.(id) || null);
    if (!b) continue;
    if (b.dataset.nlMktTitle == null) b.dataset.nlMktTitle = b.title || '';
    b.disabled = !!reason;
    b.title = reason || b.dataset.nlMktTitle;
  }
}
