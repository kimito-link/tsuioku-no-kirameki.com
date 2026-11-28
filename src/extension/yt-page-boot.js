// yt-page-boot.js — 会場(yt-venue-inline.js・約800KB)を配信の視聴ページだけに載せる。
// ホームや検索で解析すると、タブが多い低スペックの PC でインストール直後に固まる。
import { needsYtVenue, shouldPollYtVenue } from '../lib/youtube/ytVenueBoot.js';
import { startPageStallWatch } from '../lib/stallTrace.js';
import { readYtRelatedChipSnapshot } from '../lib/youtube/ytRelatedChipSnapshot.js';
import { readYtVideoCommentThreadSnapshot } from '../lib/youtube/ytVideoCommentThreadSnapshot.js';
import { ytPageExportSnapshotReady } from '../lib/youtube/ytVideoWatchMeta.js';
import { youtubeExportPageMatchesVideo } from '../lib/youtube/youtubeExportTabMatch.js';

/** @param {string} [href] */
function isYoutubeWatchPage(href) {
  try {
    const u = new URL(String(href || (typeof location !== 'undefined' ? location.href : '') || ''));
    if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return false;
    const path = u.pathname || '';
    return path === '/watch' || path.startsWith('/watch/') || path.startsWith('/live/') || path.startsWith('/shorts/');
  } catch {
    return false;
  }
}

// 書き出しタブからの一度きりの読み取り。新しい Observer・タイマー・通信は足さない。
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'YT_READ_PAGE_EXPORT_SNAPSHOT') return undefined;
    if (!isYoutubeWatchPage()) {
      try { sendResponse({ ok: false, reason: 'not-watch' }); } catch { /* 閉じたタブ */ }
      return false;
    }
    const wantedVideoId = String(msg.videoId || '').trim();
    if (!wantedVideoId || !youtubeExportPageMatchesVideo(typeof location !== 'undefined' ? location.href : '', wantedVideoId)) {
      try { sendResponse({ ok: false, reason: 'video-mismatch' }); } catch { /* 閉じたタブ */ }
      return false;
    }
    try {
      // スクレイプ直前にもう一度確認する（途中で次の動画へ移っていることがある）。
      if (!youtubeExportPageMatchesVideo(typeof location !== 'undefined' ? location.href : '', wantedVideoId)) {
        try { sendResponse({ ok: false, reason: 'video-mismatch' }); } catch { /* 閉じたタブ */ }
        return false;
      }
      // v0.1.2265: URL が B でも、画面の枠がまだ A のときは読まない(前の動画のコメントを付けない)
      const ready = ytPageExportSnapshotReady(document, wantedVideoId);
      if (ready.ok !== true) {
        try { sendResponse({ ok: false, reason: ready.reason }); } catch { /* 閉じたタブ */ }
        return false;
      }
      const relatedChip = readYtRelatedChipSnapshot(document, {
        operatorChannelId: String(msg.operatorChannelId || ''),
        operatorChannelName: String(msg.operatorChannelName || ''),
        operatorHandle: String(msg.operatorHandle || ''),
        videoId: wantedVideoId,
      });
      const commentThreads = readYtVideoCommentThreadSnapshot(document);
      sendResponse({ ok: true, relatedChip, commentThreads, videoId: wantedVideoId });
    } catch (err) {
      try { sendResponse({ ok: false, reason: String(err && err.message || err) }); } catch { /* 閉じたタブ */ }
    }
    return false;
  });
}


const root = /** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window);
if (!root.__NLS_YT_VENUE_BOOT_ASKED__) {
  const ask = () => {
    if (root.__NLS_YT_VENUE_BOOT_ASKED__) return;
    if (!needsYtVenue(String(location.href || ''))) return;
    root.__NLS_YT_VENUE_BOOT_ASKED__ = true;
    if (!root.__nlStallWatch) {
      root.__nlStallWatch = startPageStallWatch({
        file: 'yt-page-boot.js',
        send: (summary) => {
          try {
            chrome.runtime.sendMessage({ type: 'NLS_STALL_SUMMARY', page: location.hostname, summary, events: root.__nlStallWatch.takeFresh() });
          } catch { /* 計器 */ }
        },
      });
    }
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
