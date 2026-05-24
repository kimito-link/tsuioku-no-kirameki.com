/**
 * popupWatchUrlResolveMultiTab のテスト。
 *
 * 0.1.41 (W): 複数タブで kon-ta パネルのデータが混信する事象の修正。
 *
 * 背景:
 *   popup が standalone window（chrome.windows.create({type:'popup'})）として
 *   開かれた時、`chrome.tabs.query({active:true, currentWindow:true})` は
 *   popup window 自身を currentWindow とみなし、popup.html の URL を返す。
 *   popup.html は niconico URL ではないので、フォールバックで
 *   storage の `nls_last_watch_url` を見るが、これは全 watch タブの
 *   content script が 400ms debounce で書き換える last-write-wins の値で、
 *   どのタブから popup を開いても **直近にアクティブだった 1 つの watch タブの URL**
 *   を全 popup が共有してしまう。
 *
 *   結果、3 つの watch タブで popup を順番に開いても、3 つとも同じ URL を
 *   見て、同じ commentsStorageKey を見て、同じ rank strip / 件数を表示する。
 *
 *   このヘルパは「standalone popup から見えない watch タブを正しく拾う」
 *   優先順位を実装した純粋関数。chrome.windows.getLastFocused で取得した
 *   「直前にフォーカスされていた通常 window のアクティブタブ」を最優先に
 *   する（これが popup を開く前にユーザーが見ていた watch タブ）。
 *
 *   優先順位:
 *     1. activeTab が niconico watch URL（= INLINE_MODE で popup が watch ページ内 iframe）
 *     2. lastFocusedNormalActiveTab が niconico watch URL
 *        （standalone popup → 直前の通常 window の active tab）
 *     3. lastWatchUrlRaw（storage の `nls_last_watch_url`）
 *     4. 空文字
 */

import { describe, it, expect } from 'vitest';
import { pickWatchUrlFromMultipleSources } from './popupWatchUrlResolveMultiTab.js';

describe('pickWatchUrlFromMultipleSources', () => {
  it('activeTab が niconico watch URL → activeTab を採用', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: { url: 'https://live.nicovideo.jp/watch/lv12345' },
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv99999' },
      lastWatchUrlRaw: 'https://live.nicovideo.jp/watch/lv00000'
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv12345');
    expect(r.source).toBe('activeTab');
  });

  it('activeTab が popup.html（standalone popup）→ lastFocusedNormalActiveTab を採用', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: { url: 'chrome-extension://aaaaa/popup.html' },
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv12345' },
      lastWatchUrlRaw: 'https://live.nicovideo.jp/watch/lv00000'
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv12345');
    expect(r.source).toBe('lastFocusedNormal');
  });

  it('両方非 niconico → lastWatchUrlRaw fallback', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: { url: 'chrome-extension://aaaaa/popup.html' },
      lastFocusedNormalActiveTab: { url: 'https://www.google.com/' },
      lastWatchUrlRaw: 'https://live.nicovideo.jp/watch/lv12345'
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv12345');
    expect(r.source).toBe('storage');
  });

  it('全部空 / null → 空文字', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: undefined,
      lastFocusedNormalActiveTab: undefined,
      lastWatchUrlRaw: ''
    });
    expect(r.url).toBe('');
    expect(r.source).toBe('none');
  });

  it('lastFocusedNormalActiveTab だけ存在 → そちらを採用（複数タブの分離に重要）', () => {
    // standalone popup で activeTab が popup window の場合、currentWindow=popup、
    // lastFocusedNormal が「ユーザーが直前に居た watch タブ」になる
    const r = pickWatchUrlFromMultipleSources({
      activeTab: undefined,
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv11111' },
      lastWatchUrlRaw: 'https://live.nicovideo.jp/watch/lv99999'  // 古い storage 値（無視）
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv11111');
    expect(r.source).toBe('lastFocusedNormal');
  });

  it('storage 値が niconico でない → 空', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: undefined,
      lastFocusedNormalActiveTab: undefined,
      lastWatchUrlRaw: 'https://www.google.com/'
    });
    expect(r.url).toBe('');
    expect(r.source).toBe('none');
  });

  it('activeTab.url が undefined（タブ取得失敗）でも throw しない', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: { url: undefined },
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv1' },
      lastWatchUrlRaw: ''
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv1');
    expect(r.source).toBe('lastFocusedNormal');
  });

  it('activeTab が単純に no-tab（拡張ページや new tab）→ lastFocusedNormal を採用', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: { url: 'chrome://newtab/' },
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv22' },
      lastWatchUrlRaw: ''
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv22');
    expect(r.source).toBe('lastFocusedNormal');
  });

  // 0.1.349: inline iframe（watch ページ内）の多タブ混信修正。
  // background タブの iframe では activeTab が「前面の別タブ」を指すので、
  // content script 由来の自タブ liveId（inlineWatchUrl）を最優先で採用する。
  it('inlineWatchUrl があれば activeTab より最優先（背景タブの混信を回避）', () => {
    const r = pickWatchUrlFromMultipleSources({
      inlineWatchUrl: 'https://live.nicovideo.jp/watch/lv1000', // 自タブ
      activeTab: { url: 'https://live.nicovideo.jp/watch/lv2000' }, // 前面の別タブ
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv3000' },
      lastWatchUrlRaw: 'https://live.nicovideo.jp/watch/lv4000' // last-write-wins
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv1000');
    expect(r.source).toBe('inlineParam');
  });

  it('inlineWatchUrl が空 / 非 niconico → 従来の activeTab 経路にフォールバック', () => {
    const r = pickWatchUrlFromMultipleSources({
      inlineWatchUrl: '',
      activeTab: { url: 'https://live.nicovideo.jp/watch/lv2000' },
      lastWatchUrlRaw: ''
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv2000');
    expect(r.source).toBe('activeTab');
  });

  it('inlineWatchUrl が非 watch（chrome-extension URL 等）→ 無視して次候補', () => {
    const r = pickWatchUrlFromMultipleSources({
      inlineWatchUrl: 'chrome-extension://aaaaa/popup.html',
      activeTab: undefined,
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv55' },
      lastWatchUrlRaw: ''
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv55');
    expect(r.source).toBe('lastFocusedNormal');
  });

  it('inlineWatchUrl が undefined（standalone popup）でも throw せず従来挙動', () => {
    const r = pickWatchUrlFromMultipleSources({
      activeTab: { url: 'chrome-extension://aaaaa/popup.html' },
      lastFocusedNormalActiveTab: { url: 'https://live.nicovideo.jp/watch/lv77' },
      lastWatchUrlRaw: ''
    });
    expect(r.url).toBe('https://live.nicovideo.jp/watch/lv77');
    expect(r.source).toBe('lastFocusedNormal');
  });
});
