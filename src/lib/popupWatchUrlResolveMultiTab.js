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
 * 追加（0.1.414 standalone popup の multitab「中身が空」混信修正）:
 *   別ウィンドウ POP（standalone window）は inlineWatchUrl を持たず、activeTab は
 *   popup 自身（chrome-extension URL）になりがちなので lastFocusedNormal / storage に
 *   依存する。複数 watch タブを開いて時間が経つと、これらが「まだデータが溜まっていない
 *   別タブの lv」を指し、その lv の per-live storage が空 → 全カード/全チップ「—」固定に
 *   なる（lv は取れているので「前回の配信」フォールバックも走らない）。
 *
 *   そこで「どの lv に実データ（記録/snapshot）があるか」を `liveIdsWithData` で渡し、
 *   standalone 経路（activeTab が watch でないとき）の候補選択で **データのある lv を
 *   優先**する。foreground watch タブ（activeTab）と inlineWatchUrl は self-tab の真実
 *   なので、この優先は適用しない（ユーザーが今見ているタブを尊重）。
 *   `liveIdsWithData` 未指定なら挙動は完全に従来どおり（純加法）。
 *
 * 優先順位:
 *   0. inlineWatchUrl（inline iframe が自タブ liveId から構築した watch URL。最優先）
 *   1. activeTab.url が niconico watch URL
 *      （INLINE_MODE で popup が前面 watch タブ内 iframe の場合の従来経路）
 *   1.5 （standalone のみ）candidateUrls / lastFocused / storage のうち
 *       「liveIdsWithData に含まれる lv」を持つ最初の watch URL（混信時にデータのある配信へ）
 *   2. lastFocusedNormalActiveTab.url が niconico watch URL
 *      （standalone popup → 通常 window のアクティブタブ）
 *   3. lastWatchUrlRaw（storage `nls_last_watch_url`、複数タブで last-write-wins）
 *   4. 空文字
 */

import { isNicoLiveWatchUrl, extractLiveIdFromUrl } from './broadcastUrl.js';

/**
 * @typedef {{ url?: string|undefined }} TabLike
 */

/**
 * @typedef {'inlineParam' | 'activeTab' | 'dataBacked' | 'lastFocusedNormal' | 'storage' | 'none'} WatchUrlSource
 */

/**
 * @typedef {{
 *   url: string,
 *   source: WatchUrlSource
 * }} ResolvedWatchUrl
 */

/**
 * `liveIdsWithData` を lowercased lv の Set に正規化する。
 * @param {unknown} raw
 * @returns {Set<string>}
 */
function normalizeLiveIdsWithData(raw) {
  /** @type {string[]} */
  let list = [];
  if (Array.isArray(raw)) list = /** @type {unknown[]} */ (raw).map((v) => String(v || ''));
  else if (raw instanceof Set) list = [...raw].map((v) => String(v || ''));
  const out = new Set();
  for (const v of list) {
    const id = v.trim().toLowerCase();
    if (id) out.add(id);
  }
  return out;
}

/**
 * @param {{
 *   inlineWatchUrl?: unknown,
 *   activeTab?: TabLike | null | undefined,
 *   lastFocusedNormalActiveTab?: TabLike | null | undefined,
 *   lastWatchUrlRaw?: unknown,
 *   candidateUrls?: unknown,
 *   liveIdsWithData?: unknown
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
  //    ユーザーが今まさに前面にしている watch タブ＝意図が最も明確なので、
  //    データの有無に関わらず尊重する（開いた直後でまだ空でも、それが見たい配信）。
  const activeUrl = String(input.activeTab?.url ?? '').trim();
  if (isNicoLiveWatchUrl(activeUrl)) {
    return { url: activeUrl, source: 'activeTab' };
  }

  // 1.5 standalone 混信救済（0.1.414）:
  //    activeTab が watch でない＝別ウィンドウ POP 等で「自タブ」が無い状況。
  //    このとき lastFocused / storage / 開いている全 watch タブ（candidateUrls）の
  //    うち「実データのある lv」を優先して採用する。これにより、未 populate の別タブ
  //    lv を拾って全チップ「—」固定になる混信を避け、記録中の配信を確実に拾う。
  //    liveIdsWithData が空（情報なし）なら何もせず従来順にフォールバック。
  const liveIdsWithData = normalizeLiveIdsWithData(input.liveIdsWithData);
  const lastFocusedUrl = String(input.lastFocusedNormalActiveTab?.url ?? '').trim();
  const stashed = typeof input.lastWatchUrlRaw === 'string'
    ? input.lastWatchUrlRaw.trim()
    : '';
  if (liveIdsWithData.size > 0) {
    /** @type {string[]} */
    const extraCandidates = Array.isArray(input.candidateUrls)
      ? /** @type {unknown[]} */ (input.candidateUrls).map((u) => String(u || '').trim())
      : [];
    // 評価順: lastFocused → storage → その他の開いている watch タブ。
    // 同じく watch URL かつ liveIdsWithData に含まれる lv を持つ最初の候補を採用。
    const ordered = [lastFocusedUrl, stashed, ...extraCandidates];
    for (const cand of ordered) {
      if (!isNicoLiveWatchUrl(cand)) continue;
      const lv = String(extractLiveIdFromUrl(cand) || '').trim().toLowerCase();
      if (lv && liveIdsWithData.has(lv)) {
        return { url: cand, source: 'dataBacked' };
      }
    }
  }

  // 2. lastFocusedNormalActiveTab（standalone popup: 通常 window のアクティブタブ）
  if (isNicoLiveWatchUrl(lastFocusedUrl)) {
    return { url: lastFocusedUrl, source: 'lastFocusedNormal' };
  }

  // 3. storage `nls_last_watch_url`（複数タブで last-write-wins、最後の手段）
  if (isNicoLiveWatchUrl(stashed)) {
    return { url: stashed, source: 'storage' };
  }

  return { url: '', source: 'none' };
}
