// kickApi.js — kick.com のページ自身が使う API(/api/v2/channels/<slug>)の応答を、形を確かめて読む(純関数)
// @layer L0 — 純粋計算
//
// ★council/kick-support-PLAN.md・AGENTS.md §3.6: 形が違えば null。顔の URL は Kick の画像置き場だけ通す。

import { isKickSlug, parseKickTime } from './kickChatParse.js';

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' ? /** @type {Record<string, any>} */ (v) : null;
}

/** 顔の URL として使ってよいか(Kick の画像置き場の https だけ) @param {unknown} url */
export function safeKickImageUrl(url) {
  const u = String(url || '').trim();
  if (!/^https:\/\/[a-z0-9.-]*(?:kick\.com|files\.kick\.com|kick-files-prod\.s3[a-z0-9.-]*\.amazonaws\.com|kickcdn\.com)\//i.test(u)) return '';
  if (/default-profile|\/default\//i.test(u)) return '';
  return u;
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
