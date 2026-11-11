// ytPanelRoute.js — 本体のサイドパネル(グローバル・1枚)の中身を、YouTube のタブでは YouTube 版に切り替える決まり(2026-11-05 本体統合)。
//   パネルはタブ専用にしない(タブを移るたびに隠れて再表示=縞・v0.1.1696)。中の iframe の src だけを付け替える
//   (sidepanel-iframe-boot-entry.js)。0.1.1949〜 src に配信キー(&stream=)を焼き、配信が変われば読み込み直す。YouTube 版の画面 yt-sidepanel.html は scripts/youtube-build.mjs の生成物。
import { parseYtVideoIdFromUrl, isYtWatchLikeUrl, ytHandleLivePendingKey } from './ytPageMeta.js';
import { platformChannelOfUrl } from '../platform/streamPlatform.js';

export const YT_PANEL_SRC = 'yt-sidepanel.html?inline=1&dock=sidepanel';

/** @param {unknown} url */
export function isYtPanelTabUrl(url) {
  // YouTube 系(YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・TikTok)のタブは同じ画面(YouTube 版=ニコ生版の完全コピー)で見せる。
  //   ホストだけで決める(どの配信かは ytPanelStreamKeyOfUrl・council/panel-stream-selection-SPEC.md)
  return /^https:\/\/(?:www\.(?:youtube\.com|twitch\.tv)|(?:www\.)?(?:kick\.com|whowatch\.tv|showroom-live\.com|mixch\.tv|tiktok\.com))\//.test(String(url || ''));
}

/** いま iframe が YouTube 版を見せているか @param {unknown} src */
export function isYtPanelSrc(src) {
  return /^(?:\/)?yt-sidepanel\.html(?:[?#]|$)/.test(String(src || ''));
}

// ---- 0.1.1949: 外枠が「どの配信か」を src に焼く(ニコ生版の ?lv= と同じ役目・council/panel-stream-selection-SPEC.md §4-A1) ----
//   YouTube 系どうし(YouTube→Kick→TikTok…)でタブを移っても src が同じ yt-sidepanel.html のままで iframe を読み込み直さず、
//   前のサービスの言葉(「Kicks」等)が残っていた(PC 計測 0.1.1946)。配信が変わったら作り直す=ニコ生版と同じく画面がまっさらになる。

/**
 * 配信ページの URL → チャンネル単位の配信キー('yt:<videoId>' / '<サービス id>:<login>')。配信ページでなければ ''。
 * 外枠は記録を知らないので配信番号までは引かない(同じチャンネルで次の配信が始まっても作り直さない。中身は shim が追う)。
 * @param {unknown} url
 */
export function ytPanelStreamKeyOfUrl(url) {
  const u = String(url || '');
  if (!isYtPanelTabUrl(u)) return '';
  if (isYtWatchLikeUrl(u)) {
    const vid = parseYtVideoIdFromUrl(u);
    if (vid) return `yt:${vid}`;
    // /@名前/live は動画 id が後から分かる。まとめを待たず、YouTube の読み込み中として開く。
    const pending = ytHandleLivePendingKey(u);
    return pending ? `yt:${pending}` : '';
  }
  const ch = platformChannelOfUrl(u);
  return ch ? `${ch.platform.id}:${ch.login}` : '';
}

/** @param {string} key ytPanelStreamKeyOfUrl の値 */
export function buildYtPanelSrc(key) {
  const k = String(key || '');
  return k ? `${YT_PANEL_SRC}&stream=${encodeURIComponent(k)}` : YT_PANEL_SRC;
}

/** iframe の src(または location.search)から配信キーを読む @param {unknown} src */
export function readYtPanelStreamKey(src) {
  try {
    const s = String(src || '');
    const q = s.includes('?') ? s.slice(s.indexOf('?')) : s;
    return String(new URLSearchParams(q).get('stream') || '');
  } catch {
    return '';
  }
}
