/**
 * OBSの透過窓が開くコメビュを、いま見ている配信から決める。
 *
 * ニコ生の comeview.html はニコ生の記録だけを読む。YouTube でそれを開くと 0 件になる。
 * YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・TikTok の記録は、
 * YouTube 版のコメビュ（yt-comeview.html）にある。サービスごとの別ページは無い。
 *
 * 【層】L0 判定層(純粋関数・I/O禁止)
 */

import { platformChannelOfUrl } from './platform/streamPlatform.js';
import { isYtWatchLikeUrl, parseYtVideoIdFromUrl } from './youtube/ytPageMeta.js';

export const OBS_NICO_COMEVIEW_PAGE = 'comeview.html';
/** YouTube 版の画面。上のサービスはこの1枚を共用する。 */
export const OBS_SERVICE_COMEVIEW_PAGE = 'yt-comeview.html';
/** extension-youtube/src/pfLastStreamUrl.js が書くキー。 */
export const OBS_YT_LAST_STREAM_URL_KEY = 'yt_last_stream_url';

const NICO_WATCH = /^https:\/\/(?:sp\.)?live\.nicovideo\.jp\/watch\/lv\d{1,15}(?:[/?#]|$)/i;

/**
 * @param {unknown} url
 * @returns {{ page: string, serviceId: string, serviceName: string, url: string } | null}
 */
export function obsComeviewTargetForWatchUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (NICO_WATCH.test(s)) {
    return { page: OBS_NICO_COMEVIEW_PAGE, serviceId: 'niconico', serviceName: 'ニコ生', url: s };
  }
  if (isYtWatchLikeUrl(s)) {
    return { page: OBS_SERVICE_COMEVIEW_PAGE, serviceId: 'youtube', serviceName: 'YouTube', url: s };
  }
  const ch = platformChannelOfUrl(s);
  if (!ch) return null;
  return { page: OBS_SERVICE_COMEVIEW_PAGE, serviceId: ch.platform.id, serviceName: ch.platform.name, url: s };
}

/**
 * 開いている視聴タブのうち、いちばん最近見たものを使う。無ければ保存した URL。
 * タブが複数あっても、最後に見た配信を選ぶ（古いニコ生タブで YouTube を潰さない）。
 * @param {{
 *   tabs?: ReadonlyArray<{ url?: unknown, lastAccessed?: unknown }> | null,
 *   nicoWatchUrl?: unknown,
 *   ytLast?: unknown
 * }} input
 */
export function pickObsComeviewWatch(input) {
  const tabs = Array.isArray(input?.tabs) ? input.tabs : [];
  /** @type {{ page: string, serviceId: string, serviceName: string, url: string, at: number } | null} */
  let best = null;
  let bestAt = -1;
  for (const tab of tabs) {
    const hit = obsComeviewTargetForWatchUrl(tab?.url);
    if (!hit) continue;
    const at = Number(tab?.lastAccessed) || 0;
    if (!best || at >= bestAt) {
      best = { ...hit, at };
      bestAt = at;
    }
  }
  if (best) return best;
  const nico = obsComeviewTargetForWatchUrl(input?.nicoWatchUrl);
  if (nico) return { ...nico, at: 0 };
  const yt = input?.ytLast && typeof input.ytLast === 'object' ? /** @type {Record<string, unknown>} */ (input.ytLast) : null;
  const fromYt = obsComeviewTargetForWatchUrl(yt?.url);
  if (fromYt) return { ...fromYt, at: Number(yt?.at) || 0 };
  return { page: OBS_NICO_COMEVIEW_PAGE, serviceId: 'niconico', serviceName: 'ニコ生', url: '', at: 0 };
}

/**
 * 届いた配信キーが、いま開いている視聴ページのものか。
 * YouTube は動画ID。ほかのサービスは「サービスの頭 + チャンネル名.」で始まる。
 * @param {unknown} streamKey
 * @param {unknown} watchUrl
 */
export function serviceStreamMatchesWatch(streamKey, watchUrl) {
  const key = String(streamKey || '');
  const url = String(watchUrl || '');
  if (!key || !url) return false;
  if (isYtWatchLikeUrl(url)) return parseYtVideoIdFromUrl(url) === key;
  const ch = platformChannelOfUrl(url);
  if (!ch) return false;
  return key.startsWith(`${ch.platform.keyHead}${ch.login}.`);
}
