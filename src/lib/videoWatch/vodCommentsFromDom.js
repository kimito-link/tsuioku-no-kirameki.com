/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】通常動画ページの DOM / JSON-LD / 既に載っている script から、題とコメント投稿者を読むこと
 * 【この箱に入らないもの】fetch / 新しい通信 / Observer / タイマー / chrome.*
 * 【書けるstorageキー】なし
 *
 * セレクタの根拠（2026-11-26、拡張 v0.1.2229・未ログインの実キャプチャ）:
 *   - ツイキャス録画: 既存の parseTcMovieCommentDoc（.tw-comment-history-item）に加え、
 *     録画プレイヤーのコメント一覧 .tw-comment-item（movie-843232645 で 9 件確認）。
 *     初回 curl では #comment-root が空のことがある。描かれた DOM だけを読む。新しい通信はしない。
 *   - Twitch 録画: .vod-message と .chat-author__display-name
 *     （videos/2940252213 で再生チャット 11 件確認）。顔画像は DOM に無い。
 *   - Kick 録画: 実測 HTML（sirgime / 01a20e11-...）は年齢確認の壁で、チャット投稿者が無い。
 *     v0.1.2247: 描かれたページでは右の「Chat Replay」に #chatroom-messages [data-index] の行があり、
 *     名前は button[title][data-prevent-expand]（alnasty・BotRix を確認、年齢確認の壁の下でも出る）。顔画像は DOM に無い。
 *   - ABEMA: 公開エピソードの JSON-LD VideoObject（題）。コメント欄は実測 HTML に無い。
 *   - TikTok: __UNIVERSAL_DATA_FOR_REHYDRATION__ の comment 配列は実測で空。コメントは後から描かれることがある。
 */

import { parseTcMovieCommentDoc, readTcPageInfo } from '../twitcasting/tcPageInfo.js';
import { safeTcImageUrl } from '../twitcasting/tcParse.js';
import { safeTtImageUrl } from '../tiktok/ttParse.js';
import { kickSlugOfName } from '../kick/kickChatParse.js';

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
    /** @type {ArrayLike<Element>} */
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
  const merged = [...byId.values()];
  merged.sort((a, b) => (Number(b.postedAtMs) || 0) - (Number(a.postedAtMs) || 0));
  return merged;
}

/**
 * ツイキャス録画プレイヤーのコメント一覧（.tw-comment-item）。履歴ページ用の parseTcMovieCommentDoc とは別形。
 * @param {Document | null | undefined} doc
 */
function parseTcPlayerCommentItems(doc) {
  /** @type {{ id: string, author: { screenName: string, name: string, profileImage: string }, createdAt: number }[]} */
  const rows = [];
  if (!doc || typeof doc.querySelectorAll !== 'function') return rows;
  const items = doc.querySelectorAll('.tw-comment-item');
  for (let i = 0; i < items.length; i += 1) {
    const el = items[i];
    const nameA = el.querySelector('a.tw-comment-item-name');
    const href = String(nameA?.getAttribute?.('href') || '').trim();
    const screenText = text(el.querySelector('.tw-comment-item-screen-id')?.textContent);
    const fromHref = href.replace(/^\//, '').trim();
    const screen = (fromHref || screenText.replace(/^@/, '')).trim();
    if (!screen) continue;
    const timeEl = el.querySelector('time.tw-comment-item-date');
    const createdAt = parseTcPlayerDatetime(timeEl?.getAttribute?.('datetime') || timeEl?.textContent || '');
    const img = String(el.querySelector('.tw-comment-item-icon img')?.getAttribute?.('src') || '').trim();
    rows.push({
      id: String(el.getAttribute?.('data-comment-id') || ''),
      author: {
        screenName: screen,
        name: text(nameA?.textContent) || screen,
        profileImage: img,
      },
      createdAt,
    });
  }
  return rows;
}

/** @param {unknown} s @returns {number} */
function parseTcPlayerDatetime(s) {
  const m = String(s || '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6] || 0);
  if (![y, mo, d, hh, mm, ss].every((n) => Number.isFinite(n))) return 0;
  // 画面の日時は日本時間
  return Date.UTC(y, mo - 1, d, hh - 9, mm, ss);
}

/**
 * Twitch 録画の再生チャット。顔画像は実測 DOM に無く、バッジ画像だけがある。
 * @param {Document | null | undefined} doc
 */
function readTwitchVodReplayChat(doc) {
  /** @type {{ id: string, name: string, avatarUrl?: string, postedAtMs?: number, commentId?: string }[]} */
  const rows = [];
  if (!doc || typeof doc.querySelectorAll !== 'function') return mergeAuthors(rows);
  const items = doc.querySelectorAll('.vod-message');
  for (let i = 0; i < items.length; i += 1) {
    const el = items[i];
    const userEl = el.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"]');
    const login = String(userEl?.getAttribute?.('data-a-user') || '').trim();
    const name = text(userEl?.textContent);
    if (!login && !name) continue;
    rows.push({
      id: `tw:${login || name}`,
      name: name || login,
      avatarUrl: '',
      postedAtMs: 0,
    });
  }
  return mergeAuthors(rows);
}

/**
 * Kick 録画の Chat Replay(描かれた DOM)。人の区別はライブの Kick と同じ kk:@slug。
 * @param {Document | null | undefined} doc
 */
function readKickVodReplayChat(doc) {
  /** @type {{ id: string, name: string, avatarUrl?: string, postedAtMs?: number, commentId?: string }[]} */
  const rows = [];
  if (!doc || typeof doc.querySelectorAll !== 'function') return mergeAuthors(rows);
  const items = doc.querySelectorAll('#chatroom-messages [data-index]');
  for (let i = 0; i < items.length; i += 1) {
    const userEl = items[i].querySelector('button[data-prevent-expand][title]');
    const name = text(userEl?.getAttribute?.('title') || userEl?.textContent);
    if (!name) continue;
    const slug = kickSlugOfName(name);
    rows.push({ id: slug ? `kk:@${slug}` : `kk:${name}`, name, avatarUrl: '', postedAtMs: 0 });
  }
  return mergeAuthors(rows);
}

/** @param {Document | null | undefined} doc @param {string} [user] */
function readTwitcasting(doc, user) {
  /** @type {any} */
  const info = doc ? readTcPageInfo(doc, user || '') : { title: '', name: '', stats: {}, viewers: null };
  const parsed = doc ? parseTcMovieCommentDoc(doc) : { rows: [], empty: true };
  const sourceRows = parsed.rows && parsed.rows.length ? parsed.rows : parseTcPlayerCommentItems(doc);
  const authors = mergeAuthors(sourceRows.map((row) => {
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
  const walk = (/** @type {any} */ node, /** @type {number} */ depth) => {
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
  const viewCount = ld ? viewCountFromLd(ld) : null;
  /** @type {VodDomRead['authors']} */
  let authors = [];
  let commentsVerified = false;
  if (platform === 'tiktok') {
    authors = readTiktokUnverified(doc);
  } else if (platform === 'twitch') {
    authors = readTwitchVodReplayChat(doc);
    commentsVerified = true;
  } else if (platform === 'kick') {
    authors = readKickVodReplayChat(doc);
    commentsVerified = authors.length > 0;
  }
  // ABEMA の実測 HTML（2026-11-26・未ログイン）にはコメント投稿者が無かった。
  return {
    title,
    ownerName,
    viewCount,
    authors,
    commentsFound: authors.length > 0,
    commentsVerified,
  };
}
