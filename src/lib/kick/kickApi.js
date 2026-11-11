// kickApi.js — kick.com のページ自身が使う API(/api/v2/channels/<slug>)の応答を、形を確かめて読む(純関数)
// @layer L0 — 純粋計算
//
// ★council/kick-support-PLAN.md・AGENTS.md §3.6: 形が違えば null。顔の URL は Kick の画像置き場だけ通す。

import { isKickSlug, parseKickTime, safeKickImageUrl } from './kickChatParse.js';

export { safeKickImageUrl };

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' ? /** @type {Record<string, any>} */ (v) : null;
}

/** @param {string} slug */
export function kickChannelApiUrl(slug) {
  return isKickSlug(slug) ? `https://kick.com/api/v2/channels/${slug}` : '';
}

/**
 * /api/v2/channels/<slug> → 配信の情報。形が違えば null。
 * @param {unknown} json
 * @returns {null | {
 *   channelId: string, userId: string, slug: string, displayName: string, iconUrl: string, chatroomId: string,
 *   live: boolean, streamId: string, title: string, viewers: number | null, startedAtMs: number
 * }}
 */
export function parseKickChannel(json) {
  const o = obj(json);
  if (!o) return null;
  const chatroom = obj(o.chatroom);
  const user = obj(o.user);
  const chatroomId = String(chatroom?.id ?? '').trim();
  const slug = String(o.slug || '').trim().toLowerCase();
  if (!/^\d{1,20}$/.test(chatroomId) || !isKickSlug(slug)) return null;
  const ls = obj(o.livestream);
  const live = !!ls && (ls.is_live === undefined || ls.is_live === true);
  const sid = String(ls?.id ?? '').trim();
  const viewers = Number(ls?.viewer_count ?? ls?.viewers);
  return {
    channelId: String(o.id ?? ''),
    userId: String(o.user_id ?? user?.id ?? ''),
    slug,
    displayName: String(user?.username || slug),
    iconUrl: safeKickImageUrl(user?.profile_pic ?? user?.profilepic),
    chatroomId,
    live,
    streamId: live && /^\d{1,20}$/.test(sid) ? sid : '',
    title: live ? String(ls?.session_title || '') : '',
    viewers: live && Number.isFinite(viewers) && viewers >= 0 ? Math.floor(viewers) : null,
    startedAtMs: live ? parseKickTime(ls?.start_time || ls?.created_at) : 0,
  };
}

/**
 * /api/v2/channels/<slug> を人の顔を引くのに使ったとき → 顔の URL(無ければ '')
 * @param {unknown} json
 */
export function parseKickUserIcon(json) {
  const o = obj(json);
  if (!o) return '';
  const user = obj(o.user) || o;
  return safeKickImageUrl(user.profile_pic ?? user.profilepic ?? o.profile_pic);
}

/**
 * Kick 公式の Kicks ランキング → 順位表の行(YouTube のトップファンと同じ口 YT_LEADERBOARD に渡す形)。
 *   ソケットの KicksLeaderboardUpdated は gifts_lifetime/gifts_month/gifts_week、
 *   API(web.kick.com/api/v1/kicks/<id>/leaderboard)は kicks_gifts_lifetime 等(2026-11-08 PC 実測)。
 *   どちらもこれまでの累計(lifetime)を使う。形が違えば []。
 * @param {unknown} json
 * @returns {Array<{ rank: number, name: string, xp: number, iconUrl: string }>}
 */
export function parseKickKicksLeaderboard(json) {
  const o = obj(json);
  const d = obj(o?.data) || o;
  const list = d?.gifts_lifetime ?? d?.kicks_gifts_lifetime ?? obj(d?.leaderboard)?.gifts_lifetime;
  return kickBoardRows(list);
}

/**
 * Kick 公式のギフトサブの順位(kick.com のチャット欄の順位表の「サブ」・通算)→ 順位表の行。
 *   API(kick.com/api/v2/channels/<slug>/leaderboards)は gifts(通算)/gifts_week/gifts_month(2026-11-09 PC 実測)、
 *   ソケットの GiftsLeaderboardUpdated は Kicks と同じく gifts_lifetime の形と見て両方読む。形が違えば []。
 * @param {unknown} json
 * @returns {Array<{ rank: number, name: string, xp: number, iconUrl: string }>}
 */
export function parseKickSubsLeaderboard(json) {
  const o = obj(json);
  const d = obj(o?.data) || o;
  const list = d?.gifts_lifetime ?? d?.gifts ?? obj(d?.leaderboard)?.gifts_lifetime ?? obj(d?.leaderboard)?.gifts;
  return kickBoardRows(list);
}

/** @param {string} slug */
export function kickSubsLeaderboardUrl(slug) {
  const s = String(slug ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,24}$/.test(s) ? `https://kick.com/api/v2/channels/${s}/leaderboards` : '';
}

/**
 * 順位表の一覧 → 行(壊れた1行だけ捨てる)
 * @param {unknown} list
 * @returns {Array<{ rank: number, name: string, xp: number, iconUrl: string }>}
 */
function kickBoardRows(list) {
  if (!Array.isArray(list)) return [];
  /** @type {Array<{ rank: number, name: string, xp: number, iconUrl: string }>} */
  const out = [];
  for (const r0 of list.slice(0, 50)) {
    const r = obj(r0);
    const name = String(r?.username || obj(r?.user)?.username || '').trim().slice(0, 60);
    const xp = Math.floor(Number(r?.quantity ?? r?.count) || 0);
    if (!name || xp <= 0) continue; // 壊れた1行だけ捨てる
    out.push({ rank: out.length + 1, name, xp, iconUrl: '' });
  }
  return out;
}

/** @param {string | number} id チャンネル id かユーザー id(どちらか実測で確かめる) */
export function kickKicksLeaderboardUrl(id) {
  const s = String(id ?? '').trim();
  return /^\d{1,20}$/.test(s) ? `https://web.kick.com/api/v1/kicks/${s}/leaderboard` : '';
}
