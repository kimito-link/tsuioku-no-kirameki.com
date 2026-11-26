/**
 * Twitch VOD・Kick VOD・ツイキャス録画・ABEMA エピソード・TikTok 通常動画向けの小さい入口。
 * ライブ配信の記録エンジンは載せない。新しい通信・Observer・タイマーは使わない。
 * 会場モードは隠し、同時視聴は出さない。コメントはページに既にある DOM だけを読む。
 */
import { KEY_VOD_VIDEO_WATCH_CARD } from '../lib/storageKeys.js';
import { isVodVideoWatchUrl, vodWatchPageFromUrl } from '../lib/videoWatch/vodWatchUrl.js';
import { readVodWatchDom } from '../lib/videoWatch/vodCommentsFromDom.js';
import { buildVodVideoWatchCardModel } from '../lib/videoWatch/videoWatchCard.js';

function hideVenueModeForVideoPage(hide) {
  try {
    const root = document.getElementById('nlsb-venue-root');
    if (!root) return;
    if (hide) {
      root.hidden = true;
      root.setAttribute('data-nl-video-hidden', '1');
      try { document.documentElement.classList.remove('nlsb-venue-open'); } catch { /* 会場を閉じるだけ */ }
    } else if (root.getAttribute('data-nl-video-hidden') === '1') {
      root.hidden = false;
      root.removeAttribute('data-nl-video-hidden');
    }
  } catch {
    /* 会場が無くても視聴は続く */
  }
}

let lastSig = '';

function refresh() {
  const href = String(location.href || '');
  const page = vodWatchPageFromUrl(href);
  if (!page) {
    hideVenueModeForVideoPage(false);
    lastSig = '';
    return;
  }
  hideVenueModeForVideoPage(true);
  const read = readVodWatchDom(document, page);
  const card = buildVodVideoWatchCardModel({
    platform: page.platform,
    videoId: page.videoId,
    pageKey: page.pageKey,
    title: read.title,
    viewCount: read.viewCount,
    ownerId: page.ownerId,
    ownerName: read.ownerName,
    videoAuthors: read.authors,
    nowMs: Date.now(),
  });
  const sig = `${page.pageKey}:${card ? (card.videoAuthorCount || 0) : 0}:${card?.title || ''}:${card?.viewCountText || ''}`;
  if (sig === lastSig) return;
  lastSig = sig;
  try {
    void chrome.storage.local.set({
      [KEY_VOD_VIDEO_WATCH_CARD]: { videoId: page.pageKey, at: Date.now(), card },
    });
  } catch {
    /* 横の欄が読めなくても会場は隠す */
  }
}

if (isVodVideoWatchUrl(String(location.href || ''))) {
  hideVenueModeForVideoPage(true);
  refresh();
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
  } catch { /* 初回だけで足りる */ }
  try {
    document.addEventListener('click', () => refresh(), { passive: true });
  } catch { /* 同上 */ }
  try {
    window.addEventListener('pageshow', () => refresh());
  } catch { /* 同上 */ }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes?.[KEY_VOD_VIDEO_WATCH_CARD]) return;
      hideVenueModeForVideoPage(true);
    });
  } catch {
    /* 監視できなくても初回で隠す */
  }
}
