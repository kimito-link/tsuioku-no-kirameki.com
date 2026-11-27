/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】YouTube・ニコ動以外の通常動画ページに出すカードの文言と HTML
 * 【この箱に入らないもの】fetch / storage / chrome.* / 新しい Observer
 * 【書けるstorageキー】なし
 * 【正本宣言】Twitch/Kick/ツイキャス/ABEMA/TikTok の通常動画カードに出す言葉はこのファイル
 *   （視聴者の行動は viewerBehavior.js。YouTube・ニコ動のカード関数は変えない）
 */

import { attachRepliesToPeople, buildViewerBehaviorBoard, viewerBehaviorBoardInnerHtml } from '../viewerBehavior.js';

export const VOD_VIDEO_WATCH_CARD_TITLE = 'この動画のデータ';

const PLATFORMS = new Set(['twitch', 'kick', 'twitcasting', 'abema', 'tiktok']);

/**
 * @param {{
 *   videoId?: string,
 *   pageKey?: string,
 *   platform?: string,
 *   title?: string,
 *   viewCount?: number | null,
 *   ownerId?: string,
 *   ownerName?: string,
 *   videoAuthors?: readonly any[],
 *   videoComments?: readonly any[],
 *   nowMs?: number,
 * }} input
 */
export function buildVodVideoWatchCardModel(input) {
  const src = input && typeof input === 'object' ? input : {};
  const platform = PLATFORMS.has(String(src.platform || '')) ? String(src.platform) : '';
  if (!platform) return null;
  // v0.1.2241: 読めなかった(null / 空)を 0 回にしない。Number(null) は 0 なので、0.1.2239 は Kick・ABEMA・TikTok・ツイキャスで
  //   「再生 0 回」と作った数を出していた(数字を作らない)。
  const viewCount = src.viewCount != null && String(src.viewCount) !== '' && Number.isFinite(Number(src.viewCount)) && Number(src.viewCount) >= 0
    ? Math.floor(Number(src.viewCount))
    : null;
  const authors = Array.isArray(src.videoAuthors) ? src.videoAuthors : [];
  const visiblePeople = attachRepliesToPeople(authors.map((a) => ({
    id: String(a?.id || a?.userId || a?.channelId || '').trim(),
    name: String(a?.name || '').trim(),
    avatarUrl: String(a?.avatarUrl || '').trim(),
    commentCount: Number(a?.commentCount) > 0 ? Math.floor(Number(a.commentCount)) : 1,
    giftCount: a?.giftCount,
    knownAmountJpy: a?.knownAmountJpy,
    at: Number(a?.postedAtMs || a?.at) > 0 ? Math.floor(Number(a.postedAtMs || a.at)) : 0,
    pending: a?.pending === true,
    commentAnchor: String(a?.commentAnchor || a?.commentId || '').trim(),
    creatorReplies: a?.creatorReplies,
    viewerReplies: a?.viewerReplies,
    replies: a?.replies,
    // v0.1.2263: 再生チャットで読めた本文(タップで「何を書いたか」)。読めなければ無い
    ...(Array.isArray(a?.comments) && a.comments.length ? { comments: a.comments } : {}),
  })), src.videoComments);
  const behavior = buildViewerBehaviorBoard({
    visiblePeople,
    historyById: {},
    historyReady: false,
    nowMs: src.nowMs,
    viewCount,
    platform,
    contentKind: 'video',
  });
  // v0.1.2263(りんく 11-27「…まだ記録していません。…」は動画ページで否定から入って読める): 否定の言い方をやめる
  let recordedSummary = `いま見えているコメントの投稿者は ${authors.length.toLocaleString('ja-JP')} 人です。`;
  if (authors.length === 0) {
    recordedSummary = 'コメント欄が読み込まれると、ここに書いた人が並びます。';
  }
  return {
    videoId: String(src.pageKey || src.videoId || '').trim(),
    pageKey: String(src.pageKey || src.videoId || '').trim(),
    kind: 'video',
    platform,
    title: String(src.title || '').replace(/\s+/g, ' ').trim(),
    viewCount,
    viewCountText: viewCount == null ? '' : `${viewCount.toLocaleString('ja-JP')} 回`,
    ownerId: String(src.ownerId || '').trim(),
    ownerName: String(src.ownerName || '').replace(/\s+/g, ' ').trim(),
    videoAuthorCount: authors.length,
    recordedSummary,
    behavior,
  };
}

/**
 * @param {ReturnType<typeof buildVodVideoWatchCardModel> | null | undefined} model
 * @returns {string}
 */
export function vodVideoWatchCardInnerHtml(model) {
  if (!model || model.kind !== 'video' || !PLATFORMS.has(String(model.platform || ''))) return '';
  const esc = (/** @type {unknown} */ s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const views = model.viewCountText
    ? `<p class="nlsb-video-watch-card__views"><span class="nlsb-video-watch-card__label">再生</span> ${esc(model.viewCountText)}</p>`
    : '';
  return (
    `<section class="nlsb-video-watch-card" data-video-id="${esc(model.videoId)}" data-platform="${esc(model.platform)}" aria-label="${esc(VOD_VIDEO_WATCH_CARD_TITLE)}">` +
    viewerBehaviorBoardInnerHtml(model.behavior) +
    `<h2 class="nlsb-video-watch-card__title">${esc(VOD_VIDEO_WATCH_CARD_TITLE)}</h2>` +
    views +
    `<p class="nlsb-video-watch-card__recorded">${esc(model.recordedSummary)}</p>` +
    `</section>`
  );
}
