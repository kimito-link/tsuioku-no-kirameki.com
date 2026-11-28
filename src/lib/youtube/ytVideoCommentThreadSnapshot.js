/**
 * YouTube 動画ページのコメント欄を、呼んだ瞬間の DOM だけから読む。
 * 新しい通信・Observer・タイマーは使わない。折りたたまれて見えていない返信は含めない。
 */

import { parseYtCommentPublishedAtMs, parentYtCommentId } from './ytVideoWatchMeta.js';

/**
 * @typedef {{
 *   commentId: string,
 *   parentId: string,
 *   channelId: string,
 *   name: string,
 *   handle: string,
 *   avatarUrl: string,
 *   text: string,
 *   timeText: string,
 *   postedAtMs: number | null,
 *   likeCount: number | null,
 *   likeText: string,
 *   isCreator: boolean,
 *   isPinned: boolean,
 *   creatorHeart: boolean,
 *   replyCount: number | null,
 *   replyLevel: number
 * }} YtVideoCommentThreadRow
 */

/** @param {unknown} s */
function text(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {Element | null | undefined} el
 * @param {string} sel
 */
function q(el, sel) {
  if (!el || typeof el.querySelector !== 'function') return null;
  try {
    const hit = el.querySelector(sel);
    if (hit) return hit;
  } catch {
    /* セレクタが古い環境でも他を見る */
  }
  const sr = /** @type {any} */ (el).shadowRoot;
  if (sr && typeof sr.querySelector === 'function') {
    try {
      return sr.querySelector(sel);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {string} sel
 */
function qa(root, sel) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  try {
    return Array.from(root.querySelectorAll(sel));
  } catch {
    return [];
  }
}

/**
 * 絵文字の alt を残して本文を読む。
 * @param {Element | null | undefined} el
 */
export function textWithEmojiAlt(el) {
  if (!el) return '';
  /** @type {string[]} */
  const parts = [];
  const walk = (/** @type {Node} */ node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      parts.push(String(node.textContent || ''));
      return;
    }
    if (node.nodeType !== 1) return;
    const eln = /** @type {Element} */ (node);
    const tag = String(eln.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'yt-icon') {
      const alt = text(eln.getAttribute?.('alt'));
      parts.push(alt);
      return;
    }
    const children = eln.childNodes;
    for (let i = 0; i < children.length; i += 1) walk(children[i]);
  };
  walk(el);
  return parts.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 「46」「1.2万」「いいね 46 件」などから件数を取る。読めなければ null（0 と混ぜない）。
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseYtLikeCountFromText(raw) {
  const s = text(raw).replace(/,/g, '');
  if (!s) return null;
  const man = s.match(/([\d.]+)\s*万/);
  if (man) {
    const n = Number(man[1]) * 10_000;
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const num = s.match(/(\d+)/);
  if (!num) return null;
  const n = Number(num[1]);
  if (!Number.isFinite(n) || n < 0 || n > 50_000_000) return null;
  return Math.floor(n);
}

/**
 * @param {Element} el
 * @returns {string}
 */
function commentIdFromEl(el) {
  const commentId = text(el.getAttribute?.('comment-id') || el.getAttribute?.('data-comment-id'));
  if (commentId) return commentId;
  const links = qa(el, 'a[href]');
  for (const a of links) {
    const href = String(a.getAttribute?.('href') || '');
    const lc = href.match(/[?&]lc=([^&]+)/);
    if (lc) {
      try {
        return decodeURIComponent(lc[1]);
      } catch {
        return lc[1];
      }
    }
  }
  return '';
}

/**
 * @param {Element} el
 */
function authorFromEl(el) {
  let channelId = '';
  let handle = '';
  const links = qa(el, 'a[href]');
  for (const a of links) {
    const href = String(a.getAttribute?.('href') || '');
    if (!channelId) {
      const uc = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
      if (uc) channelId = uc[1];
    }
    if (!handle) {
      const h = href.match(/\/(@[^/?#]+)/);
      if (h) {
        try {
          handle = decodeURIComponent(h[1]);
        } catch {
          handle = h[1];
        }
      }
    }
  }
  const nameEl = q(el, '#author-text, #author-text yt-formatted-string, a#author-text, #name, yt-attributed-string#name, ytd-channel-name #text');
  let name = text(nameEl?.textContent).slice(0, 80);
  if (!name || /^@/.test(name)) {
    const aria = q(el, '#author-thumbnail-button')?.getAttribute?.('aria-label');
    const fromAria = text(aria).replace(/^@/, '');
    if (fromAria) name = fromAria.slice(0, 80);
  }
  if (!name) name = (handle ? handle.replace(/^@/, '') : '').slice(0, 80);
  const img = q(el, '#author-thumbnail img, yt-img-shadow img, img#img, #author-photo img');
  const avatarUrl = text(img?.getAttribute?.('src') || img?.getAttribute?.('data-src') || (img && /** @type {any} */ (img).src));
  return { channelId, handle, name, avatarUrl: /^https?:\/\//i.test(avatarUrl) ? avatarUrl : '' };
}

/**
 * @param {Element} el
 */
function likeFromEl(el) {
  const vote = q(el, '#vote-count-middle, #like-button #vote-count-middle, span#vote-count-middle');
  const likeBtn = q(el, '#like-button button, #like-button');
  const aria = text(likeBtn?.getAttribute?.('aria-label') || '');
  const likeText = text(vote?.textContent) || aria;
  const likeCount = parseYtLikeCountFromText(likeText);
  return { likeText, likeCount };
}

/**
 * @param {Element} el
 * @param {{ nowMs?: number, replyLevel?: number, parentId?: string }} opts
 * @returns {YtVideoCommentThreadRow | null}
 */
function rowFromViewModel(el, opts = {}) {
  const author = authorFromEl(el);
  const commentId = commentIdFromEl(el);
  const body = q(el, '#content-text, yt-attributed-string#content-text');
  const bodyText = textWithEmojiAlt(body);
  const publishedEl = q(el, '#published-time-text, #published-time-text a, .published-time-text, yt-formatted-string#published-time-text');
  const timeText = text(publishedEl?.getAttribute?.('aria-label') || publishedEl?.getAttribute?.('title') || publishedEl?.textContent);
  const postedAtMs = parseYtCommentPublishedAtMs(timeText, opts.nowMs);
  const likes = likeFromEl(el);
  const isCreator = Boolean(
    q(el, '.channel-owner, [class*="channel-owner"], ytd-author-comment-badge-renderer[creator], #author-comment-badge'),
  );
  const isPinned = Boolean(q(el, '#pinned-comment-badge, ytd-pinned-comment-badge-renderer'))
    || /固定|pinned/i.test(text(q(el, '#comment-pinned-text, #pinned-comment-badge')?.textContent));
  const creatorHeart = Boolean(q(el, '#creator-heart, ytd-creator-heart-renderer, [id*="creator-heart"]'));
  const replyLevel = Number(opts.replyLevel) > 0 ? 1 : 0;
  let parentId = text(opts.parentId);
  if (replyLevel > 0 && !parentId) parentId = parentYtCommentId(commentId);
  const replyBtn = q(el, '#more-replies button, #more-replies, ytd-comment-replies-renderer #more-replies, #expander #more-replies');
  const replyCount = parseYtLikeCountFromText(
    replyBtn?.getAttribute?.('aria-label') || replyBtn?.textContent,
  );
  if (!commentId && !author.channelId && !author.name && !bodyText) return null;
  return {
    commentId,
    parentId,
    channelId: author.channelId,
    name: author.name,
    handle: author.handle,
    avatarUrl: author.avatarUrl,
    text: bodyText,
    timeText,
    postedAtMs,
    likeCount: likes.likeCount,
    likeText: likes.likeText,
    isCreator,
    isPinned,
    creatorHeart,
    replyCount,
    replyLevel,
  };
}

/**
 * v0.1.2266: 行(または先頭のスレッド)のリンク /watch?v=<動画>&lc= が指す動画 id。リンクが無ければ ''。
 * @param {Element | null | undefined} el
 */
function rowVideoIdFromLinks(el) {
  for (const a of qa(el, 'a[href*="lc="]')) {
    const m = String(a.getAttribute?.('href') || '').match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return '';
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {{ nowMs?: number, limit?: number, videoId?: string }} [opts]
 * @returns {YtVideoCommentThreadRow[]}
 */
export function readYtVideoCommentThreadSnapshot(root, opts = {}) {
  if (!root) return [];
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Math.floor(Number(opts.limit))) : 200;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const wantVideo = text(opts.videoId);
  const threads = qa(root, 'ytd-comment-thread-renderer');
  /** @type {YtVideoCommentThreadRow[]} */
  const out = [];
  const hosts = threads.length ? threads : qa(root, 'ytd-comment-view-model, ytd-comment-renderer, yt-comment-view-model');
  for (const th of hosts) {
    const vms = qa(th, 'ytd-comment-view-model, ytd-comment-renderer, yt-comment-view-model');
    const list = vms.length ? vms : [th];
    let topId = '';
    for (const el of list) {
      const inReplies = typeof el.closest === 'function' && !!el.closest('ytd-comment-replies-renderer');
      const rec = rowFromViewModel(el, {
        nowMs,
        replyLevel: inReplies ? 1 : 0,
        parentId: inReplies ? topId : '',
      });
      if (!rec) continue;
      // v0.1.2266: 読む動画が決まっているときは、その動画の行だと確かめられた行だけ(返信はスレッドの先頭のリンクでも確かめる)
      if (wantVideo && (rowVideoIdFromLinks(el) || rowVideoIdFromLinks(th)) !== wantVideo) continue;
      if (!inReplies && rec.commentId) topId = rec.commentId;
      if (inReplies && !rec.parentId && topId) rec.parentId = topId;
      out.push(rec);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * スレッド行を、マーケ集計が使うコメント行の形に写す。
 * @param {readonly YtVideoCommentThreadRow[]} rows
 * @param {string} liveId
 */
export function commentsFromYtThreadSnapshot(rows, liveId) {
  const lid = String(liveId || '').trim();
  const list = Array.isArray(rows) ? rows : [];
  return list.map((r, i) => ({
    id: r.commentId || `yt_thread_${i}`,
    liveId: lid,
    commentNo: String(i + 1),
    text: r.text || '',
    // v0.1.2265: 表示名だけでは同一人物にしない(同じ名前の別人をまとめない)。channelId/handle が無い行は照合しない。
    userId: r.channelId || r.handle || '',
    nickname: r.name || '',
    name: r.name || '',
    avatarUrl: r.avatarUrl || '',
    capturedAt: r.postedAtMs || 0,
    ytChannelId: r.channelId || '',
    commentId: r.commentId || '',
    parentId: r.parentId || '',
    replyLevel: r.replyLevel || 0,
    isCreator: r.isCreator === true,
    creatorHeart: r.creatorHeart === true,
    isPinned: r.isPinned === true,
    likeCount: r.likeCount,
    replyCount: r.replyCount,
    timeText: r.timeText || '',
    ytPlatform: 'youtube',
    ytKind: 'text',
  }));
}

/**
 * 画面のスレッドにあるいいね・返信・本文を、記録の行に足す（記録の本文は上書きしない）。
 * @param {readonly Record<string, any>[]} comments
 * @param {readonly YtVideoCommentThreadRow[]} threads
 */
/**
 * @param {readonly object[]|null|undefined} comments
 * @param {readonly object[]|null|undefined} threads
 * @param {string} [liveId]
 */
export function mergeYtThreadsOntoComments(comments, threads, liveId = '') {
  const list = Array.isArray(comments) ? comments.map((c) => (c && typeof c === 'object' ? { ...c } : c)) : [];
  const rows = Array.isArray(threads) ? threads : [];
  /** @type {Map<string, YtVideoCommentThreadRow>} */
  const byId = new Map();
  for (const t of rows) {
    if (t.commentId) byId.set(t.commentId, t);
  }
  /** @type {Set<string>} */
  const used = new Set();
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.commentId || c.id || '').trim();
    const hit = id ? byId.get(id) : null;
    if (!hit) continue;
    used.add(id);
    if (!c.commentId && id) c.commentId = id;
    if (hit.text && !String(c.text || '').trim()) c.text = hit.text;
    if (hit.likeCount != null) c.likeCount = hit.likeCount;
    if (hit.replyCount != null) c.replyCount = hit.replyCount;
    if (hit.creatorHeart) c.creatorHeart = true;
    if (hit.isCreator) c.isCreator = true;
    if (hit.isPinned) c.isPinned = true;
    if (hit.parentId && !c.parentId) c.parentId = hit.parentId;
    if (hit.timeText && !c.timeText) c.timeText = hit.timeText;
    if (hit.postedAtMs && !Number(c.capturedAt)) c.capturedAt = hit.postedAtMs;
    if (hit.channelId) {
      if (!c.channelId) c.channelId = hit.channelId;
      if (!c.ytChannelId) c.ytChannelId = hit.channelId;
      c.userId = hit.channelId;
    }
    if (hit.name && !String(c.nickname || c.name || '').trim()) {
      c.nickname = hit.name;
      c.name = hit.name;
    }
    if (hit.avatarUrl && !c.avatarUrl) c.avatarUrl = hit.avatarUrl;
  }
  const leftovers = rows.filter((t) => t.commentId && !used.has(t.commentId));
  if (!leftovers.length) return list;
  const lid = String(liveId || list[0]?.liveId || '');
  return list.concat(commentsFromYtThreadSnapshot(leftovers, lid));
}
