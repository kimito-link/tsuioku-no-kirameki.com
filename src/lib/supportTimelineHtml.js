/**
 * 応援タイムラインの行 HTML を純粋に組み立てる（v0.1.340）。
 *
 * buildSupportActivityTimeline が返す TimelineItem[] を、コメント行（コンパクト）と
 * ギフト行（強調カード）の HTML 文字列に変換する。DOM/副作用なし。XSS 対策に全テキストを
 * エスケープし、リンクは数値 uid のときだけ niconico ユーザーページへ張る（匿名は span）。
 *
 * @see src/lib/supportActivityTimeline.js - 入力 TimelineItem の型と生成
 */

/** @param {unknown} s */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @param {unknown} s */
function escapeAttr(s) {
  return escapeHtml(s);
}

/** 数値 uid（記名）か。匿名（a:xxx / 合成キー）は false。 @param {unknown} uid */
function isNumericUid(uid) {
  const s = String(uid == null ? '' : uid).trim();
  return /^\d{1,18}$/.test(s) && Number(s) > 0;
}

/** ポイントを 1,234 形式に。 @param {unknown} point */
function formatPoint(point) {
  const n = Number(point);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return Math.floor(n).toLocaleString('en-US');
}

/**
 * コメント本文・名前を表示用に整える（空のときの代替文言つき）。
 * @param {string} text
 * @param {string} commentNo
 */
function commentTextShown(text, commentNo) {
  const t = String(text || '').trim();
  if (t) return t;
  const no = String(commentNo || '').trim();
  return no ? `（本文なし・No.${no}）` : '（本文なし）';
}

/**
 * TimelineItem 1 件を行 HTML に。
 * @param {import('./supportActivityTimeline.js').TimelineItem} item
 * @param {{ defaultAvatar?: string }} [opts]
 * @returns {string}
 */
export function buildTimelineRowHtml(item, opts) {
  if (!item || typeof item !== 'object') return '';
  const defaultAvatar = String(opts?.defaultAvatar || '');

  if (item.kind === 'gift') {
    const name = escapeHtml(item.nickname || '名無し');
    const itemName = escapeHtml(item.itemName || 'ギフト');
    const pt = escapeHtml(formatPoint(item.point));
    const ptBlock =
      Number(item.point) > 0
        ? `<span class="nl-tl-gift__pt">${pt}pt</span>`
        : '';
    const inner =
      `<span class="nl-tl-gift__icon" aria-hidden="true">🎁</span>` +
      `<span class="nl-tl-gift__name">${name}</span>` +
      `<span class="nl-tl-gift__item">${itemName}</span>` +
      ptBlock;
    const title = escapeAttr(
      `${item.nickname || '名無し'} が ${item.itemName || 'ギフト'}${Number(item.point) > 0 ? `（${formatPoint(item.point)}pt）` : ''} を贈りました`
    );
    if (isNumericUid(item.userId)) {
      const href = `https://www.nicovideo.jp/user/${escapeAttr(item.userId)}`;
      return `<a class="nl-tl-gift" href="${href}" target="_blank" rel="noopener noreferrer" title="${title}">${inner}</a>`;
    }
    return `<div class="nl-tl-gift" title="${title}">${inner}</div>`;
  }

  // comment
  const name = escapeHtml(item.nickname || '名無し');
  const text = escapeHtml(commentTextShown(item.text, item.commentNo));
  const av = String(item.avatarUrl || '').trim() || defaultAvatar;
  const avRp = /^https?:\/\//i.test(av) ? ' referrerpolicy="no-referrer"' : '';
  const avBlock = av
    ? `<img class="nl-tl-row__avatar" src="${escapeAttr(av)}" alt="" decoding="async"${avRp} />`
    : '';
  const selfCls = item.selfPosted ? ' nl-tl-row--self' : '';
  const inner =
    avBlock +
    `<span class="nl-tl-row__name">${name}</span>` +
    `<span class="nl-tl-row__text">${text}</span>`;
  const title = escapeAttr(`${item.nickname || '名無し'}：${commentTextShown(item.text, item.commentNo)}`);
  if (isNumericUid(item.userId)) {
    const href = `https://www.nicovideo.jp/user/${escapeAttr(item.userId)}`;
    return `<a class="nl-tl-row${selfCls}" href="${href}" target="_blank" rel="noopener noreferrer" title="${title}">${inner}</a>`;
  }
  return `<div class="nl-tl-row${selfCls}" title="${title}">${inner}</div>`;
}

/**
 * タイムライン全体の body HTML（行を連結）。空なら案内文。
 * @param {readonly import('./supportActivityTimeline.js').TimelineItem[]} timeline
 * @param {{ defaultAvatar?: string }} [opts]
 * @returns {string}
 */
export function buildSupportTimelineBodyHtml(timeline, opts) {
  const list = Array.isArray(timeline) ? timeline : [];
  if (list.length === 0) {
    return '<p class="nl-support-timeline__empty">まだコメントもギフトもありません（記録ONで時系列にたまります）</p>';
  }
  return list.map((it) => buildTimelineRowHtml(it, opts)).join('');
}
