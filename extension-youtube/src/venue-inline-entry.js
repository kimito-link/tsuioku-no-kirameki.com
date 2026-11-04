// venue-inline-entry.js — ニコ生版の視聴ページの「🏟 会場モード」(content-entry.js が呼ぶ mountVenueBarButton)を、
//   YouTube の視聴ページでそのまま動かす入口(content script・上の枠だけ)。
//   ニコ生版は視聴ページの URL(/watch/lv…)で配信を決める。YouTube の視聴ページは /watch?v=… なので、
//   動画の疑似 lv を venueBar に教えてから(ビルド時に足す __ytSetVenueLiveId)、ニコ生版と同じ呼び方で出す。
//   会場の作り・見た目・席・吹き出し・読み上げはニコ生版の venueBar.js のまま(手を加えない)。
//   ★2026-11-04 りんく「このかたちがいい」(ニコ生版の視聴ページのボタン)・「画面をくろくおおわないで」(0.1.69 の重ね窓は撤去)。
import { pseudoLvForVideoId } from './ytNicoShim.js';
// @ts-ignore ビルド時に venueBar.js の末尾へ足す(scripts/build-youtube-ext.mjs の ytVenueLiveIdPlugin)
import { mountVenueBarButton, __ytSetVenueLiveId } from '../../src/extension/venueBar.js';

/** @returns {string} */
function currentVideoId() {
  if (location.pathname !== '/watch') return '';
  try {
    return String(new URLSearchParams(location.search).get('v') || '');
  } catch {
    return '';
  }
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
function sync() {
  const vid = currentVideoId();
  if (vid === mountedVid) return;
  if (!vid) return; // 視聴ページ以外へ移っても、出した会場はそのまま(次の動画で lv を切り替える)
  __ytSetVenueLiveId(pseudoLvForVideoId(vid));
  mountedVid = vid;
  ensureBaseFontSize();
  if (!document.getElementById('nlsb-venue-root')) mountVenueBarButton();
}

// YouTube はページを読み直さずに動画を移る。1秒ごとに見て、動画が変わったら会場の配信を切り替える。
setInterval(sync, 1000);
sync();
