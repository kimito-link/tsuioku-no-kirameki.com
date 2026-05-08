import { isNicoLiveWatchUrl } from './broadcastUrl.js';

/**
 * ツールバー／サイドパネルから開いたポップアップで、ニコ生ランキングへの導線
 * （`#noWatchRankingHint`）を表示するか。
 *
 * 方針: **今フォーカスしているタブ**がニコ生 watch でないときだけ表示する。
 * バックグラウンドに別タブで watch が残っているだけでは隠さない（ユーザーが空白や
 * 別サイトを見ているときは放送を探せる導線を出す）。
 *
 * watch ページ埋め込み iframe（`INLINE_EMBED_WATCH`）では視聴中なので常に非表示。
 *
 * @param {{ inlineEmbedWatch?: boolean, focusedTabUrl?: string }} opts
 * @returns {boolean}
 */
export function shouldShowNoWatchRankingHint(opts) {
  if (!opts || opts.inlineEmbedWatch === true) return false;
  const u = String(opts.focusedTabUrl || '').trim();
  return !isNicoLiveWatchUrl(u);
}
