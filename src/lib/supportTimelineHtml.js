/**
 * 応援タイムラインの行 HTML を純粋に組み立てる（v0.1.340）。
 *
 * buildSupportActivityTimeline が返す TimelineItem[] を、コメント行（コンパクト）と
 * ギフト行（強調カード）の HTML 文字列に変換する。DOM/副作用なし。XSS 対策に全テキストを
 * エスケープし、リンクは数値 uid のときだけ niconico ユーザーページへ張る（匿名は span）。
 *
 * @see src/lib/supportActivityTimeline.js - 入力 TimelineItem の型と生成
 */

import { formatRelativeTimeJa } from './supportActivityTimeline.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { isGenericComeviewName } from './comeviewRows.js';
import { comeviewAnonLabel } from './comeviewUserNotes.js';

/**
 * v0.1.671: タイムラインの表示名。コメビュと同じルールに統一する
 *   (個人名 > 匿名IDの固定番号「匿名938」 > 従来の代替文言)。
 *   「匿名」「名無し」等の汎用名は個人名でないので、匿名IDがあれば固定番号を優先=
 *   同じ人を追いやすく、パネルとコメビュで呼び名が食い違わない。
 * @param {{ nickname?: unknown, userId?: unknown }} item
 * @returns {string}
 */
function timelineDisplayName(item) {
  const nick = String(item?.nickname || '').trim();
  if (nick && !isGenericComeviewName(nick)) return nick;
  const anon = comeviewAnonLabel(String(item?.userId || ''));
  if (anon) return anon;
  return nick || '名無し';
}

/**
 * v0.1.655: 応援タイムラインのアバター解決。記名アバター(avatarUrl)があればそれ、
 *   無ければ userId から決定論的 identicon(幾何学模様)を生成する。これまで匿名は一律
 *   defaultAvatar(りんく)に倒していたため「りんくだらけ」になっていた。応援者一覧と同じ
 *   identicon にして、匿名でもユーザーごとに見分けられる(ユーザー実機要望)。userId も
 *   無いときだけ defaultAvatar にフォールバック。
 * @param {{ avatarUrl?: unknown, userId?: unknown }} item
 * @param {string} defaultAvatar
 * @returns {{ src: string, upgradeUserKey: string }}
 */
function resolveTimelineAvatar(item, defaultAvatar) {
  const real = String(item?.avatarUrl || '').trim();
  if (real) return { src: real, upgradeUserKey: '' };
  const id = String(item?.userId || '').trim();
  if (id) {
    const identicon = anonymousIdenticonDataUrl(id, 64);
    if (identicon) return { src: identicon, upgradeUserKey: id };
  }
  return { src: defaultAvatar, upgradeUserKey: '' };
}

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
 * @param {{ defaultAvatar?: string, now?: number }} [opts]
 * @returns {string}
 */
export function buildTimelineRowHtml(item, opts) {
  if (!item || typeof item !== 'object') return '';
  const defaultAvatar = String(opts?.defaultAvatar || '');
  // v0.1.674: 行クリックでユーザー詳細(わんコメ式・名前付け/ラベル/メモ/発言一覧)を
  //   ポップアップで開けるよう、uid と表示名をデータ属性で持たせる(匿名にも付けられるのが肝)。
  const detailUid = String(item.userId || '').trim();
  const detailAttrs = detailUid
    ? ` data-nl-uid="${escapeAttr(detailUid)}" data-nl-uname="${escapeAttr(timelineDisplayName(item))}"`
    : '';
  // 「いつ」の相対時刻（v0.1.341）。空（未来/不正）なら出さない。
  const agoLabel = formatRelativeTimeJa(item.at, opts?.now);
  const agoBlock = agoLabel
    ? `<span class="nl-tl-time" aria-hidden="true">${escapeHtml(agoLabel)}</span>`
    : '';

  if (item.kind === 'gift') {
    const name = escapeHtml(timelineDisplayName(item));
    const itemName = escapeHtml(item.itemName || 'ギフト');
    const pt = escapeHtml(formatPoint(item.point));
    const ptBlock =
      Number(item.point) > 0
        ? `<span class="nl-tl-gift__pt">${pt}pt</span>`
        : '';
    // v0.1.342: 送信者アバター（あれば）に🎁バッジを重ねて「誰が」を視覚化。
    //   アバターが無い（未設定/匿名）ときは default または🎁のみ。
    const gAvatar = resolveTimelineAvatar(item, defaultAvatar);
    const gAvRp = /^https?:\/\//i.test(gAvatar.src) ? ' referrerpolicy="no-referrer"' : '';
    const gAvUpgrade = gAvatar.upgradeUserKey
      ? ` data-nl-anonymous-avatar-key="${escapeAttr(gAvatar.upgradeUserKey)}"`
      : '';
    const avatarBlock = gAvatar.src
      ? `<span class="nl-tl-gift__avatar-wrap">` +
        `<img class="nl-tl-gift__avatar" src="${escapeAttr(gAvatar.src)}" alt="" decoding="async"${gAvRp}${gAvUpgrade} />` +
        `<span class="nl-tl-gift__badge" aria-hidden="true">🎁</span>` +
        `</span>`
      : `<span class="nl-tl-gift__icon" aria-hidden="true">🎁</span>`;
    const inner =
      avatarBlock +
      `<span class="nl-tl-gift__name">${name}</span>` +
      `<span class="nl-tl-gift__item">${itemName}</span>` +
      ptBlock +
      agoBlock;
    const title = escapeAttr(
      `${timelineDisplayName(item)} が ${item.itemName || 'ギフト'}${Number(item.point) > 0 ? `（${formatPoint(item.point)}pt）` : ''} を贈りました${agoLabel ? `（${agoLabel}）` : ''}`
    );
    if (isNumericUid(item.userId)) {
      const href = `https://www.nicovideo.jp/user/${escapeAttr(item.userId)}`;
      return `<a class="nl-tl-gift" href="${href}" target="_blank" rel="noopener noreferrer" title="${title}"${detailAttrs}>${inner}</a>`;
    }
    return `<div class="nl-tl-gift" title="${title}"${detailAttrs}>${inner}</div>`;
  }

  // comment
  const name = escapeHtml(timelineDisplayName(item));
  const text = escapeHtml(commentTextShown(item.text, item.commentNo));
  const avatar = resolveTimelineAvatar(item, defaultAvatar);
  const avRp = /^https?:\/\//i.test(avatar.src) ? ' referrerpolicy="no-referrer"' : '';
  const avUpgrade = avatar.upgradeUserKey
    ? ` data-nl-anonymous-avatar-key="${escapeAttr(avatar.upgradeUserKey)}"`
    : '';
  const avBlock = avatar.src
    ? `<img class="nl-tl-row__avatar" src="${escapeAttr(avatar.src)}" alt="" decoding="async"${avRp}${avUpgrade} />`
    : '';
  const selfCls = item.selfPosted ? ' nl-tl-row--self' : '';
  const inner =
    avBlock +
    `<span class="nl-tl-row__name">${name}</span>` +
    `<span class="nl-tl-row__text">${text}</span>` +
    agoBlock;
  const title = escapeAttr(
    `${timelineDisplayName(item)}：${commentTextShown(item.text, item.commentNo)}${agoLabel ? `（${agoLabel}）` : ''}`
  );
  if (isNumericUid(item.userId)) {
    const href = `https://www.nicovideo.jp/user/${escapeAttr(item.userId)}`;
    return `<a class="nl-tl-row${selfCls}" href="${href}" target="_blank" rel="noopener noreferrer" title="${title}"${detailAttrs}>${inner}</a>`;
  }
  return `<div class="nl-tl-row${selfCls}" title="${title}"${detailAttrs}>${inner}</div>`;
}

/**
 * タイムライン全体の body HTML（行を連結）。空なら案内文。
 * @param {readonly import('./supportActivityTimeline.js').TimelineItem[]} timeline
 * @param {{ defaultAvatar?: string, now?: number }} [opts]
 * @returns {string}
 */
export function buildSupportTimelineBodyHtml(timeline, opts) {
  const list = Array.isArray(timeline) ? timeline : [];
  if (list.length === 0) {
    return '<p class="nl-support-timeline__empty">まだコメントもギフトもありません（記録ONで時系列にたまります）</p>';
  }
  return list.map((it) => buildTimelineRowHtml(it, opts)).join('');
}
