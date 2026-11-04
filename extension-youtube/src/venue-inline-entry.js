// venue-inline-entry.js — ニコ生版の視聴ページの「🏟 会場モード」(content-entry.js が呼ぶ mountVenueBarButton)を、
//   YouTube の視聴ページでそのまま動かす入口(content script・上の枠だけ)。
//   ニコ生版は視聴ページの URL(/watch/lv…)で配信を決める。YouTube の視聴ページは /watch?v=… なので、
//   動画の疑似 lv を venueBar に教えてから(ビルド時に足す __ytSetVenueLiveId)、ニコ生版と同じ呼び方で出す。
//   会場の作り・見た目・席・吹き出し・読み上げはニコ生版の venueBar.js のまま(手を加えない)。
//   ★2026-11-04 りんく「このかたちがいい」(ニコ生版の視聴ページのボタン)・「画面をくろくおおわないで」(0.1.69 の重ね窓は撤去)。
import { pseudoLvForVideoId } from './ytNicoShim.js';
import { parseYtVideoIdFromUrl, isYtWatchLikeUrl } from '../../src/lib/youtube/ytPageMeta.js';
// @ts-ignore ビルド時に venueBar.js の末尾へ足す(scripts/build-youtube-ext.mjs の ytVenueLiveIdPlugin)
import { mountVenueBarButton, __ytSetVenueLiveId } from '../../src/extension/venueBar.js';
// ニコ生版の放送ページと同じ見回り: 拡張が入れ替わったあと古い版のまま止まったページを、自分で読み込み直す
//   (content-entry.js の startOrphanTabAutoReloadInPage。2026-11-04 実機: 更新後も古い会場が動き続け、キャラ画像が読めない)。
import { startOrphanTabAutoReloadInPage } from '../../src/extension/orphanTabAutoReloadHost.js';
import { isExtensionContextAlive } from '../../src/lib/reportSilentError.js';

/** @returns {string} 視聴ページ(/watch?v= ・ /live/<id>)の動画 id。視聴ページでなければ '' */
function currentVideoId() {
  const href = String(location.href || '');
  return isYtWatchLikeUrl(href) ? parseYtVideoIdFromUrl(href) : '';
}

// ニコ生版の会場は、ニコ生の視聴ページの文字の大きさ(16px)を受け継ぐ前提で作られている(例: 人の札の幅 26ch)。
//   YouTube の視聴ページは html の文字が 10px なので、札が 140px に細くなり1〜2文字ずつ折り返していた(2026-11-04 実測:
//   ニコ生 224px・YouTube 140px)。会場の根元だけ、ニコ生のページと同じ 16px にする(会場の中の見た目はニコ生版のまま)。
function ensureBaseFontSize() {
  if (document.getElementById('ytNlsbVenueBaseFont')) return;
  const st = document.createElement('style');
  st.id = 'ytNlsbVenueBaseFont';
  st.textContent = '#nlsb-venue-root{font-size:16px;}';
  (document.head || document.documentElement).appendChild(st);
}

let mountedVid = '';
/** 視聴ページ以外(ホーム・検索など)へ移ったら、会場をしまって隠す。ニコ生の視聴ページは移るとページごと消えるのと同じに見せる */
function setRootShown(/** @type {boolean} */ shown) {
  const root = /** @type {HTMLElement|null} */ (document.getElementById('nlsb-venue-root'));
  if (!root) return;
  if (!shown && document.documentElement.classList.contains('nlsb-venue-open')) {
    root.querySelector('.nlsb-close-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  root.style.display = shown ? '' : 'none';
}
function sync() {
  const vid = currentVideoId();
  if (!vid) {
    setRootShown(false);
    return;
  }
  setRootShown(true);
  if (vid === mountedVid) return;
  __ytSetVenueLiveId(pseudoLvForVideoId(vid));
  mountedVid = vid;
  ensureBaseFontSize();
  if (!document.getElementById('nlsb-venue-root')) mountVenueBarButton();
}

// YouTube はページを読み直さずに動画を移る。1秒ごとに見て、動画が変わったら会場の配信を切り替える。
setInterval(sync, 1000);
sync();

if (window.top === window) startOrphanTabAutoReloadInPage(() => isExtensionContextAlive());

// 計器(2026-11-04): 会場の画像の読み込み失敗を記録する。りんくの拡張のエラー一覧に「Unsafe attempt to load URL … from frame」が
//   YouTube 版だけ出る(ニコ生版には出ない)。画面の画像は出ているので、どの画像が・いつ・どんな状態で失敗しているかを数える。
//   保存先 yt_diag_img_errors(最新40件)。見た目は変えない。
(() => {
  /** @type {any[]} */
  let buf = [];
  let total = 0;
  let timer = 0;
  const flush = () => {
    timer = 0;
    try {
      if (!isExtensionContextAlive()) return;
      void chrome.storage.local.set({ yt_diag_img_errors: { at: Date.now(), total, items: buf.slice(-40) } }).catch(() => {});
    } catch {
      /* 計器は本体を止めない */
    }
  };
  document.addEventListener(
    'error',
    (ev) => {
      const el = /** @type {any} */ (ev.target);
      if (!(el instanceof HTMLImageElement)) return;
      const root = document.getElementById('nlsb-venue-root');
      if (!root || !root.contains(el)) return;
      total += 1;
      let dom = '';
      try {
        dom = String(document.domain);
      } catch {
        dom = '?';
      }
      buf.push({
        at: Date.now(),
        src: String(el.getAttribute('src') || '').slice(0, 160),
        cur: String(el.currentSrc || '').slice(0, 160),
        cls: String(el.className || '').slice(0, 60),
        parentCls: String(el.parentElement?.className || '').slice(0, 60),
        connected: el.isConnected,
        ownerIsDoc: el.ownerDocument === document,
        ready: document.readyState,
        vis: document.visibilityState,
        dom,
        href: String(location.href).slice(0, 80),
        open: document.documentElement.classList.contains('nlsb-venue-open'),
      });
      if (buf.length > 80) buf = buf.slice(-40);
      if (!timer) timer = window.setTimeout(flush, 2000);
    },
    true,
  );
})();
