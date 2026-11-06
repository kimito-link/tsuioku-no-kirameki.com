// ytVenueOverlayPrep.js — 会場(venue.html)を YouTube の視聴ページの上に重ねて開くときの下ごしらえ。
//   ニコ生版の会場は ?lv= で配信を決める。視聴ページからは動画の id(?vid=)で開くので、疑似 lv に直してから
//   ニコ生版の本物の会場(venue-entry.js)を動かす(このファイルは venue-entry.js より先に読む)。
//   ?overlay=1 のときは「重ねた会場」: 閉じる(window.close)は親の視聴ページへ知らせ、
//   真ん中の映像の場所(.nlsb-safe-area)を親へ送り、親がページの本物のプレーヤーをそこへ置く。
import { pseudoLvForVideoId } from './ytNicoShim.js';

export const YT_VENUE_OVERLAY = (() => {
  try {
    return new URLSearchParams(location.search).get('overlay') === '1';
  } catch {
    return false;
  }
})();

try {
  const sp = new URLSearchParams(location.search);
  const vid = sp.get('vid');
  if (vid && !sp.get('lv')) {
    sp.set('lv', pseudoLvForVideoId(vid));
    history.replaceState(null, '', `${location.pathname}?${sp.toString()}`);
  }
} catch {
  /* 直せなければ ?lv= のまま */
}

if (YT_VENUE_OVERLAY && typeof window !== 'undefined' && window.parent !== window) {
  const post = (/** @type {any} */ msg) => {
    try {
      window.parent.postMessage({ source: 'yt-venue', ...msg }, 'https://www.youtube.com');
    } catch {
      /* 親が居なければ何もしない */
    }
  };
  // 会場の「✕ 閉じる」は window.close() を呼ぶ。重ねた会場ではタブを閉じず、親に会場をしまってもらう
  window.close = () => post({ type: 'close' });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') post({ type: 'close' });
  });
  let last = '';
  setInterval(() => {
    // 重ねた会場はタブではないので「✕ タブを閉じる」を「✕ 閉じる」に
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent === '✕ タブを閉じる') b.textContent = '✕ 閉じる';
    }
    const el = document.querySelector('.nlsb-safe-area');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    const sig = JSON.stringify(rect);
    if (sig === last) return;
    last = sig;
    post({ type: 'safe-rect', rect });
  }, 300);
}
