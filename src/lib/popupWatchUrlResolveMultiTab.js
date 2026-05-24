/**
 * popup が参照する watch URL を「複数の候補ソース」から決める純粋関数。
 *
 * 設計（0.1.41 W）:
 *   popup が standalone window として開かれている場合
 *   （chrome.windows.create({type:'popup'})）、
 *   `chrome.tabs.query({active:true, currentWindow:true})` は popup window
 *   自身を currentWindow とみなし、popup.html の URL を返す。これは
 *   niconico URL ではないので、従来コードは storage `nls_last_watch_url`
 *   へフォールバックしていた。しかし `nls_last_watch_url` は全 watch タブ
 *   の content script が last-write-wins で書き換えるため、複数タブで
 *   popup を開くと **すべての popup が直近 1 つの watch タブの URL を見る**
 *   という混信現象が発生していた。
 *
 *   このヘルパは「popup を開く直前にユーザーが見ていた通常 window の
 *   アクティブタブ」（chrome.windows.getLastFocused({windowTypes:['normal']})
 *   から取得）を 2 番目の候補に追加し、storage よりも優先する。
 *
 * 追加（0.1.349 多タブ inline 混信修正）:
 *   watch ページ内 iframe（`popup.html?inline=1`）は、background タブに居ると
 *   `chrome.tabs.query({active:true, currentWindow:true})` が「自タブでなく前面の
 *   別タブ」を返す（currentWindow=呼び出し元ページを含む window、active=その window
 *   の前面タブ）。結果 background タブの inline panel が別タブ/last-write-wins の
 *   liveId を解決し、自タブの per-live storage が空 → 全カード「—」+ ランキング
 *   「(取得中...)」で永続的に固まる（F5 でも背景のままなので直らない）。
 *   content script は自タブ liveId を知っているので、iframe src に `&lv=<id>` を
 *   焼き込んで popup に渡す。その値をここで `inlineWatchUrl` として最優先で採用する。
 *
 * 優先順位:
 *   0. inlineWatchUrl（inline iframe が自タブ liveId から構築した watch URL。最優先）
 *   1. activeTab.url が niconico watch URL
 *      （INLINE_MODE で popup が前面 watch タブ内 iframe の場合の従来経路）
 *   2. lastFocusedNormalActiveTab.url が niconico watch URL
 *      （standalone popup → 通常 window のアクティブタブ）
 *   3. lastWatchUrlRaw（storage `nls_last_watch_url`、複数タブで last-write-wins）
 *   4. 空文字
 */

import { isNicoLiveWatchUrl } from './broadcastUrl.js';

/**
 * @typedef {{ url?: string|undefined }} TabLike
 */

/**
 * @typedef {'inlineParam' | 'activeTab' | 'lastFocusedNormal' | 'storage' | 'none'} WatchUrlSource
 */

/**
 * @typedef {{
 *   url: string,
 *   source: WatchUrlSource
 * }} ResolvedWatchUrl
 */

/**
 * @param {{
 *   inlineWatchUrl?: unknown,
 *   activeTab?: TabLike | null | undefined,
 *   lastFocusedNormalActiveTab?: TabLike | null | undefined,
 *   lastWatchUrlRaw?: unknown
 * }} input
 * @returns {ResolvedWatchUrl}
 */
export function pickWatchUrlFromMultipleSources(input) {
  if (!input || typeof input !== 'object') {
    return { url: '', source: 'none' };
  }

  // 0. inlineWatchUrl（inline iframe が自タブ liveId から構築。最優先）
  //    background タブの iframe で tabs.query が前面の別タブを拾う混信を、
  //    content script 由来の自タブ liveId で確定させる（多タブ「—」固まり根治）。
  const inlineUrl =
    typeof input.inlineWatchUrl === 'string' ? input.inlineWatchUrl.trim() : '';
  if (isNicoLiveWatchUrl(inlineUrl)) {
    return { url: inlineUrl, source: 'inlineParam' };
  }

  // 1. activeTab（INLINE_MODE: popup が前面 watch タブ内 iframe のとき有効）
  const activeUrl = String(input.activeTab?.url ?? '').trim();
  if (isNicoLiveWatchUrl(activeUrl)) {
    return { url: activeUrl, source: 'activeTab' };
  }

  // 2. lastFocusedNormalActiveTab（standalone popup: 通常 window のアクティブタブ）
  const lastFocusedUrl = String(input.lastFocusedNormalActiveTab?.url ?? '').trim();
  if (isNicoLiveWatchUrl(lastFocusedUrl)) {
    return { url: lastFocusedUrl, source: 'lastFocusedNormal' };
  }

  // 3. storage `nls_last_watch_url`（複数タブで last-write-wins、最後の手段）
  const stashed = typeof input.lastWatchUrlRaw === 'string'
    ? input.lastWatchUrlRaw.trim()
    : '';
  if (isNicoLiveWatchUrl(stashed)) {
    return { url: stashed, source: 'storage' };
  }

  return { url: '', source: 'none' };
}
