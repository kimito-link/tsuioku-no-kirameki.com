// ytPanelRoute.js — 本体のサイドパネル(グローバル・1枚)の中身を、YouTube のタブでは YouTube 版に切り替える決まり(2026-11-05 本体統合)。
//   パネルはタブ専用にしない(タブを移るたびに隠れて再表示=縞・v0.1.1696)。中の iframe の src だけを付け替える
//   (sidepanel-iframe-boot-entry.js)。YouTube 版の画面 yt-sidepanel.html は scripts/youtube-build.mjs の生成物。

export const YT_PANEL_SRC = 'yt-sidepanel.html?inline=1&dock=sidepanel';

/** @param {unknown} url */
export function isYtPanelTabUrl(url) {
  // Twitch のタブも同じ画面(YouTube 版の画面=ニコ生版の完全コピー)で見せる。記録は同じ置き場(council/twitch-support-PLAN.md)
  return /^https:\/\/(?:www\.(?:youtube\.com|twitch\.tv)|(?:www\.)?(?:kick\.com|whowatch\.tv|showroom-live\.com|mixch\.tv))\//.test(String(url || ''));
}

/** いま iframe が YouTube 版を見せているか @param {unknown} src */
export function isYtPanelSrc(src) {
  return /^(?:\/)?yt-sidepanel\.html(?:[?#]|$)/.test(String(src || ''));
}
