/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】通常動画ページの「どのサービスの、どの動画か」(動画の身元)を 1 つの形で決めること
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / ライブ配信の判定
 * 【書けるstorageキー】なし
 * 【正本宣言】動画カードを書く側(視聴ページ)と、塗る側(横の欄)が照合に使う「動画の身元」はこのファイルだけが決める
 *
 * なぜ 1 か所にするか(v0.1.2241):
 *   0.1.2239 では、書く側はページの URL から鍵を作り、横の欄は「内部の watch URL」(ニコ生の lv・疑似 lv・空)から鍵を作っていた。
 *   2 つの道が別々に鍵を作るので、7 サービスすべてで一致せず、横の欄に 0 人と出た。
 *   ここで決めた身元を両方が使えば、サービスが増えても「書いた鍵」と「探す鍵」は必ず同じ形になる。
 *
 * 鍵の形(今までに保存したカードとそのまま一致する形を正本にした):
 *   YouTube        : 動画 id 11 文字                       例 kKl0E22tU78
 *   ニコニコ動画   : sm / so / nm 番号(小文字)            例 sm9
 *   Twitch 録画    : twvod:<id>
 *   Kick 録画      : kkvod:<channel>/<id>
 *   ツイキャス録画 : tcmov:<user>/<id>
 *   ABEMA          : abep:<episode>
 *   TikTok 動画    : ttvid:<user>/<id>
 *   ライブ配信・一覧ページ・知らないページは null(動画カードを出さない=ライブの画面は何も変わらない)。
 */

import { nicoVideoIdFromUrl } from '../niconico/nicoVideoWatchMeta.js';
import { parseYtVideoIdFromUrl } from '../youtube/ytPageMeta.js';
import { vodWatchPageFromUrl } from './vodWatchUrl.js';

/**
 * @typedef {'youtube' | 'niconico' | 'twitch' | 'kick' | 'twitcasting' | 'abema' | 'tiktok'} VideoService
 * @typedef {{ service: VideoService, videoId: string, key: string }} VideoIdentity
 */

/** Twitch・Kick・ツイキャス・ABEMA・TikTok(カードは同じ置き場 nls_vod_video_watch_card_v1) */
export const VOD_VIDEO_SERVICES = Object.freeze(['twitch', 'kick', 'twitcasting', 'abema', 'tiktok']);

/** @param {unknown} raw @returns {URL | null} */
function parseAbsUrl(raw) {
  try {
    return new URL(String(raw || ''));
  } catch {
    return null;
  }
}

/** @param {URL} u */
function isYoutubeHost(u) {
  const h = u.hostname.toLowerCase();
  return h === 'www.youtube.com' || h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtu.be';
}

/**
 * YouTube の動画 1 本を見ているページか(/watch?v= ・/shorts/<id> ・youtu.be/<id>)。
 * /live/<id> と /@名前/live はライブの入口なので、ここでは身元を作らない(ライブ画面は何も変えない)。
 * @param {URL} u
 */
function youtubeVideoIdOf(u) {
  if (!isYoutubeHost(u)) return '';
  const p = u.pathname;
  if (p.startsWith('/live_chat') || p.startsWith('/live/') || /\/live\/?$/.test(p)) return '';
  if (u.hostname.toLowerCase() !== 'youtu.be' && p !== '/watch' && !/^\/shorts\/[A-Za-z0-9_-]{11}(?:\/|$)/.test(p)) return '';
  return parseYtVideoIdFromUrl(u.href) || '';
}

/**
 * ページの URL → 動画の身元。動画でなければ null。
 * @param {unknown} href
 * @returns {VideoIdentity | null}
 */
export function videoIdentityFromUrl(href) {
  const u = parseAbsUrl(href);
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  const vod = vodWatchPageFromUrl(u.href);
  if (vod) return { service: vod.platform, videoId: vod.videoId, key: vod.pageKey };
  const nico = nicoVideoIdFromUrl(u.href);
  if (nico) return { service: 'niconico', videoId: nico, key: nico };
  const yt = youtubeVideoIdOf(u);
  if (yt) return { service: 'youtube', videoId: yt, key: yt };
  return null;
}

/**
 * 横の欄から見た「いま前に出ているタブ」の本当の URL。
 * YouTube 系の横の欄はタブの URL をニコ生の疑似 lv に写す(ytNicoShim の mapTab)が、本物を __ytUrl に残している。
 * @param {{ url?: string, pendingUrl?: string, __ytUrl?: string } | null | undefined} tab
 * @returns {string}
 */
export function videoPageUrlOfTab(tab) {
  if (!tab || typeof tab !== 'object') return '';
  return String(tab.__ytUrl || tab.url || tab.pendingUrl || '').trim();
}

/**
 * 保存してあるカード({ videoId, card })の鍵。
 * @param {{ videoId?: string, identityKey?: string } | null | undefined} wrap
 * @returns {string}
 */
export function videoCardWrapKey(wrap) {
  if (!wrap || typeof wrap !== 'object') return '';
  return String(wrap.identityKey || wrap.videoId || '').trim();
}

/**
 * 保存してあるカードが、この動画の身元のものか。置き場(slot)のサービスも合わせて見る
 * (YouTube の id 11 文字と、ニコ動の sm+9 桁が同じ文字列になっても取り違えない)。
 * @param {{ videoId?: string, identityKey?: string } | null | undefined} wrap
 * @param {VideoIdentity | null | undefined} identity
 * @param {'youtube' | 'niconico' | 'vod'} slot
 * @returns {boolean}
 */
export function videoCardWrapMatchesIdentity(wrap, identity, slot) {
  if (!identity || !identity.key) return false;
  const svc = identity.service;
  if (slot === 'youtube' && svc !== 'youtube') return false;
  if (slot === 'niconico' && svc !== 'niconico') return false;
  if (slot === 'vod' && !VOD_VIDEO_SERVICES.includes(svc)) return false;
  const key = videoCardWrapKey(wrap);
  return !!key && key === identity.key;
}
