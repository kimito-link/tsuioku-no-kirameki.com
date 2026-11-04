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

let mountedVid = '';
function sync() {
  const vid = currentVideoId();
  if (vid === mountedVid) return;
  if (!vid) return; // 視聴ページ以外へ移っても、出した会場はそのまま(次の動画で lv を切り替える)
  __ytSetVenueLiveId(pseudoLvForVideoId(vid));
  mountedVid = vid;
  if (!document.getElementById('nlsb-venue-root')) mountVenueBarButton();
}

// YouTube はページを読み直さずに動画を移る。1秒ごとに見て、動画が変わったら会場の配信を切り替える。
setInterval(sync, 1000);
sync();
