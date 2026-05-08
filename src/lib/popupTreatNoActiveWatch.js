import { isNicoLiveWatchUrl } from './broadcastUrl.js';

/**
 * standalone / side panel で「通常ウィンドウの前面タブ」がニコ生 watch でないときは、
 * storage に前回の watch URL が残っていても背景タブだけが視聴中のケースを empty に寄せる。
 * （新規タブ等で POP を開いたのにフル応援 UI のままになる症状の対策）
 *
 * watch ページ埋め込み iframe（embedWatchIframe=true かつ sidePanel=false）では
 * 視聴コンテキスト固定のためゲートしない。
 *
 * @param {{
 *   resolvedWatchUrl: string,
 *   watchUrlSource: 'activeTab' | 'lastFocusedNormal' | 'storage' | 'none',
 *   hasOpenMatchingWatchTab: boolean,
 *   embedWatchIframe: boolean,
 *   sidePanel: boolean,
 *   focusedNormalTabUrl?: string | null
 * }} input
 * @returns {boolean}
 */
export function computeTreatAsNoActiveWatch(input) {
  const url = String(input.resolvedWatchUrl || '').trim();
  if (!isNicoLiveWatchUrl(url)) return true;
  if (input.watchUrlSource === 'none') return true;
  if (!input.hasOpenMatchingWatchTab) return true;

  const embedWatchIframe = Boolean(input.embedWatchIframe);
  const sidePanel = Boolean(input.sidePanel);
  const gateFocused = !embedWatchIframe || sidePanel;
  if (!gateFocused) return false;

  const focused = String(input.focusedNormalTabUrl ?? '').trim();
  return !isNicoLiveWatchUrl(focused);
}

/**
 * computeTreatAsNoActiveWatch が true になる理由を人間可読に（診断バンドル用）。
 * @param {{
 *   resolvedWatchUrl: string,
 *   watchUrlSource: 'activeTab' | 'lastFocusedNormal' | 'storage' | 'none',
 *   hasOpenMatchingWatchTab: boolean,
 *   embedWatchIframe: boolean,
 *   sidePanel: boolean,
 *   focusedNormalTabUrl?: string | null
 * }} input
 * @returns {string}
 */
export function explainTreatAsNoActiveWatch(input) {
  const url = String(input.resolvedWatchUrl || '').trim();
  if (!isNicoLiveWatchUrl(url)) {
    return 'resolvedWatchUrl がニコ生 watch URL ではない';
  }
  if (input.watchUrlSource === 'none') {
    return 'watchUrlSource が none（URL 解決できず）';
  }
  if (!input.hasOpenMatchingWatchTab) {
    return '同一放送に一致する視聴タブが開いていない（storage / lastFocused の URL のみ）';
  }
  const embedWatchIframe = Boolean(input.embedWatchIframe);
  const sidePanel = Boolean(input.sidePanel);
  const gateFocused = !embedWatchIframe || sidePanel;
  if (!gateFocused) {
    return 'embedWatchIframe かつ sidePanel でないため前面タブゲート対象外';
  }
  const focused = String(input.focusedNormalTabUrl ?? '').trim();
  if (!isNicoLiveWatchUrl(focused)) {
    return '通常ウィンドウ前面タブがニコ生 watch ではない（empty 寄せポリシー）';
  }
  return '前面タブも視聴タブも満たす（通常は treatAsNoActiveWatch=false）';
}
