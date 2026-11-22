/* global URL */
/*
 * 紅白の順位の下に出す入手案内。
 * 公開ページにある店の URL は Chrome 拡張だけ。iOS / Android の店 URL はサイトに無いので出さない。
 */
(function (root) {
  'use strict';
  var CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/cjbabignmmodaickpeckiojjabnlogdb';

  function withLineExternalBrowser(url) {
    var parsed = new URL(url);
    parsed.searchParams.set('openExternalBrowser', '1');
    return parsed.toString();
  }

  /**
   * @param {string} userAgent
   * @returns {null | { kind: 'chrome', href: string, label: string, text: string }}
   */
  function appCtaForUserAgent(userAgent) {
    var ua = String(userAgent || '');
    if (/iPhone|iPad|iPod/i.test(ua) || /Android/i.test(ua)) return null;
    var chromeDesktop = /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua) && !/CriOS/.test(ua);
    if (!chromeDesktop) return null;
    return {
      kind: 'chrome',
      href: withLineExternalBrowser(CHROME_EXTENSION_URL),
      label: 'Chrome 拡張を入れる（無料）',
      text: '推しの配信を見逃さない。応援コメントを、手元に残せます。'
    };
  }

  root.KouhakuAppCta = { appCtaForUserAgent: appCtaForUserAgent };
})(typeof globalThis !== 'undefined' ? globalThis : this);
