/**
 * videoPanelRoute.js — 横の欄の外枠(sidepanel-iframe-boot-entry.js)が、録画・通常動画のページで中身を付け替えるかを決める純関数。v0.1.2244
 *
 * ■ なぜ要るか(0.1.2241 実機・同じタブでページを移ったとき)
 *   外枠は「配信キー」(yt:<動画ID> / twitch:<login> …)が変わったときだけ中身を付け替える。録画・ニコ動・TikTok 動画の URL は
 *   配信キーが空なので、前のページの中身が残っていた(TikTok で「ABEMA の放送を開いて…」、ニコ動で「YouTube には…」)。
 *
 * ■ 決まり(ライブ配信・トップ等のページは null = 今までどおり)
 *   - YouTube の通常動画: null(配信キー yt:<動画ID> で今までどおり付け替わる)。
 *   - ニコ動(sm/so/nm): YouTube 系の中身を見せているときだけ、ニコ生版の中身(lv なし)へ。ニコ生の配信を見せているときは保つ。
 *   - 録画(Twitch/Kick/ツイキャス/ABEMA/TikTok): 見せている中身が別のサービス(または YouTube 系でない)のときだけ、そのサービスの中身(配信なし)へ。
 *   身元は videoIdentity.js(書く側・横の欄の照合と同じ関数)。
 */
import { videoIdentityFromUrl } from './videoIdentity.js';
import { isYtPanelSrc, ytPanelSiteOfUrl, buildYtPanelSrc, readYtPanelSite } from '../youtube/ytPanelRoute.js';

/**
 * @param {unknown} tabUrl 前面タブの URL
 * @param {unknown} currentSrc いま中身に付いている src
 * @param {unknown} nicoBase ニコ生版の中身の素の src(sidepanel.html の data-nl-src)
 * @returns {string | null} 付け替える src。付け替えないなら null
 */
export function videoPanelSrcForTab(tabUrl, currentSrc, nicoBase) {
  const identity = videoIdentityFromUrl(tabUrl);
  if (!identity || identity.service === 'youtube') return null;
  const cur = String(currentSrc || '');
  if (identity.service === 'niconico') {
    const base = String(nicoBase || '');
    if (!base || !isYtPanelSrc(cur)) return null;
    return base;
  }
  const site = ytPanelSiteOfUrl(tabUrl);
  if (!site) return null;
  if (isYtPanelSrc(cur) && readYtPanelSite(cur) === site) return null;
  return buildYtPanelSrc('', site);
}
