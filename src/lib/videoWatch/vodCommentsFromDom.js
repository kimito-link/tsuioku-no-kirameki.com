/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】通常動画ページの DOM / JSON-LD / 既に載っている script から、題とコメント投稿者を読むこと
 * 【この箱に入らないもの】fetch / 新しい通信 / Observer / タイマー / chrome.*
 * 【書けるstorageキー】なし
 *
 * セレクタの根拠:
 *   - ツイキャス: 既存の parseTcMovieCommentDoc / readTcPageInfo（コメント一覧の実測 HTML）。
 *     録画ページの初回 HTML（ログインなし curl、2026-11-26）では #comment-root は空で、
 *     コメントは後から描かれる。描かれたあとの DOM だけを読む。新しい通信はしない。
 *   - ABEMA: 公開エピソードの JSON-LD VideoObject（題）。コメント欄は初回 HTML に無い。
 *   - Twitch / Kick / TikTok: ログインなし curl の初回 HTML にコメント投稿者は無かった。
 *     ページに後から出たコメントを、明らかな印があれば拾うが、セレクタは未確認。
 */

import { parseTcMovieCommentDoc, readTcPageInfo } from '../twitcasting/tcPageInfo.js';
import { safeTcImageUrl } from '../twitcasting/tcParse.js';
import { safeTtImageUrl } from '../tiktok/ttParse.js';

/**
 * @typedef {{
 *   title: string,
 *   ownerName: string,
 *   viewCount: number | null,
 *   authors: { id: string, name: string, avatarUrl: string, postedAtMs: number, commentCount: number, commentId?: string }[],
 *   commentsFound: boolean,
 *   commentsVerified: boolean,
 * }} VodDomRead
 */

/** @param {unknown} s */
function text(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** @param {Document | null | undefined} doc @param {string} prop */
function og(doc, prop) {
  try {
    return text(doc?.querySelector(`meta[property="${prop}"]`)?.getAttribute('content'));
  } catch {
    return '';
  }
}

/** @param {Document | null | undefined} doc */
function jsonLdVideos(doc) {
  /** @type {any[]} */
  const out = [];
  try {
    const nodes = doc?.querySelectorAll('script[type="application/ld+json"]') || [];
    for (let i = 0; i < nodes.length; i += 1) {
      try {
        const raw = JSON.parse(nodes[i].textContent || 'null');
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const item of list) {
          if (item && typeof item === 'object' && (item['@type'] === 'VideoObject' || item['@type'] === 'Movie')) out.push(item);
        }
      } catch {
        /* 壊れた JSON-LD は飛ばす */
      }
    }
  } catch {
    /* 無くても og から読む */
  }
  return out;
}

/** @param {any} video */
function viewCountFromLd(video) {
  const n = Number(video?.interactionStatistic?.userInteractionCount ?? video?.commentCount);
  if (Number.isFinite(n) && n >= 0 && video?.interactionStatistic) return Math.floor(n);
  const views = Number(video?.interactionCount ?? video?.userInteractionCount);
  return Number.isFinite(views) && views >= 0 ? Math.floor(views) : null;
}

/**
 * @param {readonly { id: string, name: string, avatarUrl?: string, postedAtMs?: number, commentId?: string }[]} rows
 */
function mergeAuthors(rows) {
  /** @type {Map<string, { id: string, name: string, avatarUrl: string, postedAtMs: number, commentCount: number, commentId?: string }>} */
  const byId = new Map();
  for (const row of rows) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    const cur = byId.get(id);
    const at = Number(row.postedAtMs) > 0 ? Math.floor(Number(row.postedAtMs)) : 0;
    if (!cur) {
      byId.set(id, {
        id,
        name: text(row.name).slice(0, 80) || id,
        avatarUrl: String(row.avatarUrl || '').trim(),
        postedAtMs: at,
        commentCount: 1,
        commentId: row.commentId ? String(row.commentId) : undefined,
      });
      continue;
    }
    cur.commentCount += 1;
    if (at >= cur.postedAtMs) {
      cur.postedAtMs = at;
      if (row.name) cur.name = text(row.name).slice(0, 80);
      if (row.avatarUrl) cur.avatarUrl = String(row.avatarUrl);
      if (row.commentId) cur.commentId = String(row.commentId);
    }
  }
  return [...byId.values()];
}

/** @param {Document | null | undefined} doc @param {string} [user] */
function readTwitcasting(doc, user) {
  const info = doc ? readTcPageInfo(doc, user || '') : { title: '', name: '', stats: {}, viewers: null };
  const parsed = doc ? parseTcMovieCommentDoc(doc) : { rows: [], empty: true };
  const authors = mergeAuthors(parsed.rows.map((row) => {
    const screen = String(row?.author?.screenName || row?.author?.id || '').trim();
    return {
      id: screen ? `tc:${screen}` : '',
      name: String(row?.author?.name || screen),
      avatarUrl: safeTcImageUrl(row?.author?.profileImage),
      postedAtMs: Number(row?.createdAt) || 0,
      commentId: row?.id != null ? String(row.id) : '',
    };
  }));
  const title = text(info.title) || og(doc, 'og:title') || text(doc?.title);
  const viewCount = info.stats && Number.isFinite(Number(info.stats.totalViews)) ? Number(info.stats.totalViews) : null;
  return {
    title,
    ownerName: text(info.name),
    viewCount,
    authors,
    commentsFound: authors.length > 0,
    commentsVerified: true,
  };
}

/** @param {Document | null | undefined} doc */
function titleFromDoc(doc) {
  const ld = jsonLdVideos(doc)[0];
  return text(ld?.name) || og(doc, 'og:title') || text(doc?.querySelector('h1')?.textContent) || text(doc?.title);
}

/**
 * TikTok のコメント。curl は WAF に阻まれ、公開 HTML でのセレクタは未確認。
 * ページに既にある UNIVERSAL_DATA の comment 配列だけを、形が明らかなとき読む。
 * @param {Document | null | undefined} doc
 */
function readTiktokUnverified(doc) {
  /** @type {any} */
  let data = null;
  try {
    const el = doc?.querySelector('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
    if (el?.textContent) data = JSON.parse(el.textContent);
  } catch {
    data = null;
  }
  /** @type {{ id: string, name: string, avatarUrl?: string, postedAtMs?: number, commentId?: string }[]} */
  const rows = [];
  const walk = (/** @type {any} */ node, depth) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const user = node.user || node.userInfo || node.author;
    const textVal = node.text || node.commentLanguage || node.content;
    const uid = user && (user.uid || user.id || user.uniqueId);
    const nick = user && (user.nickname || user.nickName || user.uniqueId);
    if (uid && (typeof textVal === 'string' || node.cid || node.commentId) && nick) {
      const unique = String(user.uniqueId || uid);
      rows.push({
        id: `tt:${unique}`,
        name: String(nick),
        avatarUrl: safeTtImageUrl(user.avatarThumb || user.avatarMedium || user.avatarUrl || ''),
        postedAtMs: Number(node.createTime || node.createdAt) > 1e12
          ? Math.floor(Number(node.createTime || node.createdAt))
          : Number(node.createTime || node.createdAt) > 1e9
            ? Math.floor(Number(node.createTime || node.createdAt) * 1000)
            : 0,
        commentId: String(node.cid || node.commentId || ''),
      });
      return;
    }
    for (const key of Object.keys(node)) {
      if (/comment/i.test(key)) walk(node[key], depth + 1);
    }
  };
  if (data) walk(data, 0);
  return mergeAuthors(rows);
}

/**
 * @param {Document | null | undefined} doc
 * @param {{ platform?: string, ownerId?: string }} page
 * @returns {VodDomRead}
 */
export function readVodWatchDom(doc, page) {
  const platform = String(page?.platform || '');
  if (platform === 'twitcasting') return readTwitcasting(doc, page?.ownerId);
  const ld = jsonLdVideos(doc)[0];
  const title = titleFromDoc(doc);
  const ownerName = text(ld?.author?.name) || '';
  let viewCount = ld ? viewCountFromLd(ld) : null;
  /** @type {VodDomRead['authors']} */
  let authors = [];
  let commentsVerified = false;
  if (platform === 'tiktok') {
    authors = readTiktokUnverified(doc);
  }
  // Twitch / Kick / ABEMA の公開 HTML（2026-11-26・ログインなし curl）にはコメント投稿者の印が無かった。
  return {
    title,
    ownerName,
    viewCount,
    authors,
    commentsFound: authors.length > 0,
    commentsVerified,
  };
}
