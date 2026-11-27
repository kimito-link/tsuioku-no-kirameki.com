/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】Twitch / Kick / ツイキャス / ABEMA / TikTok の通常動画（VOD）URL の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / ライブ配信の判定
 * 【書けるstorageキー】なし
 * 【正本宣言】これら5サービスの「通常動画ページ」URL はこのファイルだけが決める
 *
 * ライブ配信のチャンネル URL は既存の parse*FromUrl のまま（空を返すものは変えない）。
 * ABEMA の parseAbLoginFromUrl は見逃し（p-）も login にするが、会場・同時接続は出さない。
 */

import { isKickSlug } from '../kick/kickChatParse.js';
import { isTcUser } from '../twitcasting/tcParse.js';
import { isTtUniqueId } from '../tiktok/ttParse.js';

/**
 * @typedef {{
 *   platform: 'twitch' | 'kick' | 'twitcasting' | 'abema' | 'tiktok',
 *   videoId: string,
 *   pageKey: string,
 *   ownerId: string,
 *   href: string,
 * }} VodWatchPage
 */

/** @param {unknown} raw @returns {URL | null} */
function parseUrl(raw) {
  try {
    return new URL(String(raw || ''));
  } catch {
    return null;
  }
}

/**
 * Twitch の VOD: https://www.twitch.tv/videos/<id>
 * @param {unknown} raw
 * @returns {VodWatchPage | null}
 */
export function parseTwitchVodFromUrl(raw) {
  const u = parseUrl(raw);
  if (!u || !/(^|\.)twitch\.tv$/i.test(u.hostname)) return null;
  const m = /^\/videos\/(\d{5,20})\/?$/i.exec(u.pathname);
  if (!m) return null;
  const videoId = m[1];
  return { platform: 'twitch', videoId, pageKey: `twvod:${videoId}`, ownerId: '', href: u.href };
}

/**
 * Kick の VOD: https://kick.com/<ch>/videos/<id>
 * id は数字でも、公開ページで確認した ULID（01a20f53-…）でもよい。一覧 /<ch>/videos は対象外。
 * @param {unknown} raw
 * @returns {VodWatchPage | null}
 */
export function parseKickVodFromUrl(raw) {
  const u = parseUrl(raw);
  if (!u || !/^(?:www\.)?kick\.com$/i.test(u.hostname)) return null;
  const m = /^\/([^/]+)\/videos\/([a-z0-9][a-z0-9-]{4,79})\/?$/i.exec(u.pathname);
  if (!m) return null;
  const channel = m[1].toLowerCase();
  const videoId = m[2];
  if (!isKickSlug(channel)) return null;
  if (channel === 'videos' || channel === 'video' || channel === 'clips') return null;
  return { platform: 'kick', videoId, pageKey: `kkvod:${channel}/${videoId}`, ownerId: channel, href: u.href };
}

/**
 * ツイキャスの録画: https://twitcasting.tv/<user>/movie/<id>
 * @param {unknown} raw
 * @returns {VodWatchPage | null}
 */
export function parseTwitcastingMovieFromUrl(raw) {
  const u = parseUrl(raw);
  if (!u || !/^(?:www\.)?twitcasting\.tv$/i.test(u.hostname)) return null;
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  const m = /^\/([^/]+)\/movie\/(\d{1,20})\/?$/.exec(path);
  if (!m) return null;
  const user = m[1].toLowerCase();
  if (!isTcUser(user)) return null;
  const videoId = m[2];
  return { platform: 'twitcasting', videoId, pageKey: `tcmov:${user}/${videoId}`, ownerId: user, href: u.href };
}

/**
 * ABEMA のエピソード（見逃し）: https://abema.tv/video/episode/<id>
 * @param {unknown} raw
 * @returns {VodWatchPage | null}
 */
export function parseAbemaEpisodeFromUrl(raw) {
  const u = parseUrl(raw);
  if (!u || !/^(?:www\.)?abema\.tv$/i.test(u.hostname)) return null;
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const m = /^\/video\/episode\/([a-z0-9][a-z0-9_-]{0,60})$/i.exec(path);
  if (!m) return null;
  const videoId = m[1].toLowerCase();
  return { platform: 'abema', videoId, pageKey: `abep:${videoId}`, ownerId: '', href: u.href };
}

/**
 * TikTok の通常動画: https://www.tiktok.com/@user/video/<id>
 * @param {unknown} raw
 * @returns {VodWatchPage | null}
 */
export function parseTiktokVideoFromUrl(raw) {
  const u = parseUrl(raw);
  if (!u || !/^(?:www\.)?tiktok\.com$/i.test(u.hostname)) return null;
  const m = /^\/@([A-Za-z0-9_.]{2,24})\/video\/(\d{5,30})\/?$/.exec(u.pathname);
  if (!m || !isTtUniqueId(m[1])) return null;
  const user = m[1];
  const videoId = m[2];
  return { platform: 'tiktok', videoId, pageKey: `ttvid:${user.toLowerCase()}/${videoId}`, ownerId: user, href: u.href };
}

/**
 * 5サービスの通常動画ページならその情報。ライブ配信や一覧ページなら null。
 * @param {unknown} raw
 * @returns {VodWatchPage | null}
 */
export function vodWatchPageFromUrl(raw) {
  return (
    parseTwitchVodFromUrl(raw) ||
    parseKickVodFromUrl(raw) ||
    parseTwitcastingMovieFromUrl(raw) ||
    parseAbemaEpisodeFromUrl(raw) ||
    parseTiktokVideoFromUrl(raw)
  );
}

/** @param {unknown} raw @returns {boolean} */
export function isVodVideoWatchUrl(raw) {
  return vodWatchPageFromUrl(raw) != null;
}
