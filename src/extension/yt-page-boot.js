// yt-page-boot.js — 会場(yt-venue-inline.js・約800KB)を配信の視聴ページだけに載せる。
// ホームや検索で解析すると、タブが多い低スペックの PC でインストール直後に固まる。
import { needsYtVenue, shouldPollYtVenue } from '../lib/youtube/ytVenueBoot.js';

const root = typeof globalThis !== 'undefined' ? globalThis : window;
if (!root.__NLS_YT_VENUE_BOOT_ASKED__) {
  const ask = () => {
    if (root.__NLS_YT_VENUE_BOOT_ASKED__) return;
    if (!needsYtVenue(String(location.href || ''))) return;
    root.__NLS_YT_VENUE_BOOT_ASKED__ = true;
    try {
      chrome.runtime.sendMessage({ type: 'NLS_BOOT_ENGINE', file: 'dist/yt-venue-inline.js' }, (res) => {
        if (!res || res.ok !== true) root.__NLS_YT_VENUE_BOOT_ASKED__ = false;
      });
    } catch {
      root.__NLS_YT_VENUE_BOOT_ASKED__ = false;
    }
  };
  ask();
  if (!root.__NLS_YT_VENUE_BOOT_ASKED__ && shouldPollYtVenue(String(location.href || ''))) {
    const timer = setInterval(() => {
      ask();
      if (root.__NLS_YT_VENUE_BOOT_ASKED__) clearInterval(timer);
    }, 1000);
    setTimeout(() => clearInterval(timer), 120000);
    try {
      document.addEventListener('yt-navigate-finish', ask);
    } catch {
      /* ページにこのイベントが無くても、上の見回りで足りる */
    }
  }
}
