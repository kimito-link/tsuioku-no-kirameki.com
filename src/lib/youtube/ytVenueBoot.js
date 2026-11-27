/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】会場(yt-venue-inline.js)をそのページに載せるかの判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】YouTube 等のトップページで 800KB 級の会場スクリプトを解析しない判断はここだけ
 *
 * ytVenueBoot.js — 会場スクリプトは配信の視聴ページだけで要る。
 * ホームや検索でも解析すると、タブが多い低スペックの PC でインストール直後に固まる。
 */

import { parseAbLoginFromUrl } from '../abema/abParse.js';
import { parseKickVodFromUrl, parseAbemaEpisodeFromUrl, venueVideoPageFromUrl } from '../videoWatch/vodWatchUrl.js';

/**
 * @param {string} href
 * @returns {boolean}
 */
export function needsYtVenue(href) {
  let url;
  try {
    url = new URL(String(href || ''));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname || '';
  if (host === 'www.youtube.com') return /^\/(watch|live|shorts)(\/|$)/.test(path);
  // v0.1.2263: Twitch・Kick・ツイキャスの録画、TikTok の動画のページにも会場を載せる(YouTube の動画と同じ会場)
  if (venueVideoPageFromUrl(url.href)) return true;
  if (host === 'www.twitch.tv') {
    if (path === '/' || path === '') return false;
    if (/^\/(directory|search|downloads|settings|subscriptions|wallet|inventory|videos|clips|moderator|drops)(\/|$)/.test(path)) {
      return false;
    }
    return /^\/[^/]+/.test(path);
  }
  if (host === 'kick.com') {
    if (path === '/' || path === '') return false;
    if (/^\/(categories|following|search)(\/|$)/.test(path)) return false;
    if (parseKickVodFromUrl(url.href)) return false;
    return /^\/[^/]+/.test(path);
  }
  if (host === 'whowatch.tv' || host.endsWith('.whowatch.tv')) return /\/viewer\//.test(path);
  if (host === 'www.showroom-live.com') return /\/r\//.test(path);
  if (host === 'mixch.tv') return /\/live/.test(path);
  if (host === 'www.tiktok.com' || host === 'tiktok.com') return /\/live(\/|$)/.test(path);
  // ABEMA(#608): 放送中のチャンネル・ライブイベントの視聴ページだけ。見逃し（/video/episode）は会場を載せない。
  if (host === 'abema.tv' || host === 'www.abema.tv') {
    if (parseAbemaEpisodeFromUrl(url.href)) return false;
    return !!parseAbLoginFromUrl(url.href);
  }
  return false;
}

/**
 * @param {string} href
 * @returns {boolean}
 */
export function shouldPollYtVenue(href) {
  let url;
  try {
    url = new URL(String(href || ''));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    host === 'www.youtube.com' ||
    host === 'www.twitch.tv' ||
    host === 'kick.com' ||
    host === 'whowatch.tv' ||
    host.endsWith('.whowatch.tv') ||
    host === 'www.showroom-live.com' ||
    host === 'mixch.tv' ||
    host === 'www.tiktok.com' ||
    host === 'tiktok.com' ||
    host === 'abema.tv' ||
    host === 'www.abema.tv'
  );
}
