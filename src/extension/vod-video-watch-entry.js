/**
 * Twitch VOD・Kick VOD・ツイキャス録画・ABEMA エピソード・TikTok 通常動画向けの小さい入口。
 * ライブ配信の記録エンジンは載せない。新しい通信・Observer・タイマーは使わない。
 * 会場モードは隠し、同時視聴は出さない。コメントはページに既にある DOM だけを読む。
 */
import { KEY_VOD_VIDEO_WATCH_CARD } from '../lib/storageKeys.js';
import { isVodVideoWatchUrl, vodWatchPageFromUrl } from '../lib/videoWatch/vodWatchUrl.js';
import { readVodWatchDom } from '../lib/videoWatch/vodCommentsFromDom.js';
import { buildVodVideoWatchCardModel } from '../lib/videoWatch/videoWatchCard.js';
import { videoIdentityFromUrl } from '../lib/videoWatch/videoIdentity.js';

/** 横の欄(viewerBehaviorBoardPaint.js)が既存の見回りで送る「読み直して」の合図 */
const VIDEO_WATCH_REREAD_MESSAGE = 'NLS_VIDEO_WATCH_REREAD';

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
  // 横の欄と同じ関数で作った身元の鍵で書く(書く鍵と探す鍵を 1 つにする・v0.1.2241)
  const identity = videoIdentityFromUrl(href);
  const key = identity ? identity.key : page.pageKey;
  const read = readVodWatchDom(document, page);
  const card = buildVodVideoWatchCardModel({
    platform: page.platform,
    videoId: page.videoId,
    pageKey: key,
    title: read.title,
    viewCount: read.viewCount,
    ownerId: page.ownerId,
    ownerName: read.ownerName,
    videoAuthors: read.authors,
    nowMs: Date.now(),
  });
  const sig = `${key}:${card ? (card.videoAuthorCount || 0) : 0}:${card?.title || ''}:${card?.viewCountText || ''}`;
  if (sig === lastSig) return;
  lastSig = sig;
  try {
    void chrome.storage.local.set({
      [KEY_VOD_VIDEO_WATCH_CARD]: { videoId: key, at: Date.now(), card },
    });
  } catch {
    /* 横の欄が読めなくても会場は隠す */
  }
}

/*
 * v0.1.2244: 入口はサービスのどのページにも載る(manifest の matches をサービス全体に広げた)。
 *   Twitch・Kick・TikTok などはサイトの中のリンクで録画へ移っても文書を読み直さない(SPA)ので、録画の URL のときだけ載せる形では
 *   入口がいないまま横の欄の「読み直して」が空振りしていた。ライブ・トップのページでは refresh() が URL を見て何もしない
 *   (会場を隠すのは録画の URL のときだけ・ライブへ戻れば自分が隠した会場だけ戻す)。
 */
{
  if (isVodVideoWatchUrl(String(location.href || ''))) hideVenueModeForVideoPage(true);
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
    // 横の欄が開いている間だけ届く(既存の見回りに乗る)。録画チャットのように後から描かれるコメントを拾う。
    //   DOM を読むだけで、変化が無ければ書かない(上の sig)。新しいタイマー・Observer は使わない。
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== VIDEO_WATCH_REREAD_MESSAGE) return;
      refresh();
    });
  } catch {
    /* 合図が無くてもクリック・可視復帰で読む */
  }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes?.[KEY_VOD_VIDEO_WATCH_CARD]) return;
      // 別のタブの録画カードが書かれても、このページがライブなら会場は隠さない
      if (!isVodVideoWatchUrl(String(location.href || ''))) return;
      hideVenueModeForVideoPage(true);
    });
  } catch {
    /* 監視できなくても初回で隠す */
  }
}
