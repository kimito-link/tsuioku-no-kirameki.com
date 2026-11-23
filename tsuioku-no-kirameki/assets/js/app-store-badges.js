/* global document, window */
/*
 * スマホアプリ「追憶のきらめき ライブビュー」のストアへの導線（公式バッジ）。
 *
 * なぜ要るか（2026-11-22 りんく「web系のもので、アプリがあるものは必ずアプリへの導線を入れて欲しい」）:
 *   Google Play（com.kimito.link.tsuioku）で公開中なのに、トップには「Android は審査中」のままで入手ボタンが無かった。
 *   決まり: web-ios-android docs/ai-rules/15_APP_LINK_FROM_WEB.md ／ 金型: web-ios-android templates/web/app-download-section.html
 *
 * - 公式バッジ（images/store-badges/・fetch-store-badges.mjs で取得、改変しない）。高さ48pxで揃える（assets/css/app-download.css）。
 * - 端末で出し分け: iPhone/iPad→App Store だけ／Android→Google Play だけ／PC→公開中の全部。
 *   その端末のストアがまだ公開前なら何も出さない（別 OS のストアで代わりにしない）。
 * - アプリ（Capacitor 殻）の中では出さない。
 * - ★公開前のストアは出さない（押すと 404）。iPhone 版（App Store id6826728669）は公開前なので IOS_PUBLISHED=false。
 *   公開されたら true にし、index.html の <head> に
 *   <meta name="apple-itunes-app" content="app-id=6826728669, app-argument=https://tsuioku-no-kirameki.com/"> を足す。
 *   ID は mobile/app.config.json の stores と同じ（src/lib/appStoreBadges.test.js が固定）。
 *
 * 使い方: <div data-app-store-badges data-lead="…"></div> を置いて、このファイルを読み込む。
 */
(function (root) {
  'use strict';

  var ASC_APP_ID = '6826728669';
  var IOS_PUBLISHED = false;
  var PLAY_PACKAGE = 'com.kimito.link.tsuioku';
  var PLAY_PUBLISHED = true;

  var STORES = [
    {
      kind: 'ios',
      published: IOS_PUBLISHED,
      href: 'https://apps.apple.com/jp/app/id' + ASC_APP_ID,
      img: 'images/store-badges/apple-appstore-ja.svg',
      alt: 'App Storeで入手',
      width: 131
    },
    {
      kind: 'android',
      published: PLAY_PUBLISHED,
      href: 'https://play.google.com/store/apps/details?id=com.kimito.link.tsuioku',
      img: 'images/store-badges/google-play-ja.png',
      alt: 'Google Playで手に入れよう',
      width: 124
    }
  ];

  /** @param {string} userAgent @param {boolean} [touchMac] iPadOS 13+ が Mac を名乗るとき */
  function viewerKind(userAgent, touchMac) {
    var ua = String(userAgent || '');
    if (/iPhone|iPad|iPod/i.test(ua) || touchMac) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return null;
  }

  /** 出すストア（公開中だけ・端末に合うものだけ）。 */
  function storesForUserAgent(userAgent, touchMac) {
    var kind = viewerKind(userAgent, touchMac);
    return STORES.filter(function (s) {
      return s.published && (!kind || s.kind === kind);
    });
  }

  function isInsideApp(w) {
    try {
      var c = w && w.Capacitor;
      if (c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()) return true;
      if (w && w.ReactNativeWebView) return true;
    } catch { /* 判定できなければブラウザ扱い */ }
    return false;
  }

  function render(el, stores) {
    var lead = el.getAttribute('data-lead');
    var html = '<div class="app-download">';
    if (lead) html += '<p class="app-download__lead">' + lead.replace(/[<>&"]/g, '') + '</p>';
    html += '<div class="app-download__badges">';
    stores.forEach(function (s) {
      html += '<a href="' + s.href + '" target="_blank" rel="noopener" class="store-badge" data-store="' + s.kind + '" aria-label="' + s.alt + '">'
        + '<img src="' + s.img + '" alt="' + s.alt + '" width="' + s.width + '" height="48"></a>';
    });
    html += '</div>';
    if (stores.length > 1) html += '<p class="app-download__note">スマホで開くと、お使いの端末に合ったストアが表示されます</p>';
    html += '</div>';
    el.innerHTML = html;
  }

  function mountAll(doc, w) {
    if (isInsideApp(w)) return;
    var nav = w.navigator || {};
    var touchMac = nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
    var stores = storesForUserAgent(nav.userAgent, touchMac);
    if (!stores.length) return;
    var els = doc.querySelectorAll('[data-app-store-badges]');
    for (var i = 0; i < els.length; i++) render(els[i], stores);
  }

  root.AppStoreBadges = { storesForUserAgent: storesForUserAgent, isInsideApp: isInsideApp, ASC_APP_ID: ASC_APP_ID, PLAY_PACKAGE: PLAY_PACKAGE };

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { mountAll(document, window); });
    } else {
      mountAll(document, window);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
