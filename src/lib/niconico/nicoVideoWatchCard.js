/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ニコニコ動画の通常動画ページに出すカードの文言と HTML
 * 【この箱に入らないもの】fetch / storage / chrome.* / 新しい Observer
 * 【書けるstorageキー】なし
 * 【正本宣言】ニコ動の通常動画カードに出す言葉はこのファイル（視聴者の行動は viewerBehavior.js）
 */

import { attachRepliesToPeople, buildViewerBehaviorBoard, viewerBehaviorBoardInnerHtml } from '../viewerBehavior.js';
import { isNicoNumericUserId } from './nicoVideoWatchMeta.js';

export const NICO_VIDEO_WATCH_CARD_TITLE = 'この動画のデータ';

/**
 * @param {{
 *   videoId?: string,
 *   title?: string,
 *   viewCount?: number | null,
 *   ownerId?: string,
 *   ownerName?: string,
 *   recorded?: { streamCount?: number, itemCount?: number },
 *   videoAuthors?: readonly { userId?: string, name?: string, commentCount?: number, postedAtMs?: number }[],
 *   livePeople?: Record<string, any> | Map<string, any> | null,
 *   historyReady?: boolean,
 *   nowMs?: number,
 *   videoComments?: readonly any[],
 *   spend?: any,
 *   takeHome?: any,
 * }} input
 */
export function buildNicoVideoWatchCardModel(input) {
  const src = input && typeof input === 'object' ? input : {};
  // v0.1.2241: 読めなかった(null)を 0 回にしない(Number(null) は 0)
  const viewCount = src.viewCount != null && String(src.viewCount) !== '' && Number.isFinite(Number(src.viewCount)) && Number(src.viewCount) >= 0
    ? Math.floor(Number(src.viewCount))
    : null;
  const recorded = src.recorded && typeof src.recorded === 'object' ? src.recorded : {};
  const streamCount = Math.max(0, Math.floor(Number(recorded.streamCount) || 0));
  const itemCount = Math.max(0, Math.floor(Number(recorded.itemCount) || 0));
  const authors = Array.isArray(src.videoAuthors) ? src.videoAuthors : [];
  const numericAuthors = authors.filter((a) => isNicoNumericUserId(a?.userId));
  const rawHist = src.livePeople;
  const histCount = rawHist instanceof Map ? rawHist.size : rawHist && typeof rawHist === 'object' ? Object.keys(rawHist).length : 0;
  const historyReady = src.historyReady != null ? !!src.historyReady : streamCount > 0 || histCount > 0;
  const behavior = buildViewerBehaviorBoard({
    visiblePeople: attachRepliesToPeople(authors.map((a) => ({
      id: String(a?.userId || '').trim(),
      name: String(a?.name || '').trim(),
      avatarUrl: String(a?.avatarUrl || '').trim(),
      commentCount: a?.commentCount,
      giftCount: a?.giftCount,
      knownAmountJpy: a?.knownAmountJpy,
      at: a?.postedAtMs,
      pending: a?.pending,
      commentAnchor: String(a?.commentAnchor || a?.commentId || '').trim(),
      creatorReplies: a?.creatorReplies,
      viewerReplies: a?.viewerReplies,
      replies: a?.replies,
    })), src.videoComments),
    historyById: rawHist || {},
    historyReady,
    nowMs: src.nowMs,
    viewCount,
    spend: src.spend || null,
    takeHome: src.takeHome || null,
    platform: 'niconico',
    contentKind: 'video',
  });
  let recordedSummary = 'この投稿者の配信を、このPCではまだ記録していません。配信を開いて記録すると、動画のコメント欄と照合できます。';
  if (streamCount > 0) {
    recordedSummary = `この投稿者の配信を、このPCで ${streamCount.toLocaleString('ja-JP')} 本記録しています（コメント合計 ${itemCount.toLocaleString('ja-JP')} 件）。`;
  } else if (histCount > 0) {
    recordedSummary = `この投稿者の配信や動画で、このPCに残っている人が ${histCount.toLocaleString('ja-JP')} 人います。いま見えているコメントと照合します。`;
  }
  const matched = numericAuthors.filter((a) => {
    if (!rawHist) return false;
    const id = String(a.userId);
    return rawHist instanceof Map ? rawHist.has(id) : Object.prototype.hasOwnProperty.call(rawHist, id);
  });
  return {
    videoId: String(src.videoId || '').trim(),
    kind: 'video',
    platform: 'niconico',
    title: String(src.title || '').replace(/\s+/g, ' ').trim(),
    viewCount,
    viewCountText: viewCount == null ? '—' : `${viewCount.toLocaleString('ja-JP')} 回`,
    ownerId: String(src.ownerId || '').trim(),
    ownerName: String(src.ownerName || '').replace(/\s+/g, ' ').trim(),
    recordedStreams: streamCount,
    recordedComments: itemCount,
    recordedSummary,
    videoAuthorCount: authors.length,
    matchedCount: matched.length,
    behavior,
  };
}

/**
 * @param {ReturnType<typeof buildNicoVideoWatchCardModel> | null | undefined} model
 * @returns {string}
 */
export function nicoVideoWatchCardInnerHtml(model) {
  if (!model || model.kind !== 'video') return '';
  const esc = (/** @type {unknown} */ s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return (
    `<section class="nlsb-video-watch-card" data-video-id="${esc(model.videoId)}" data-platform="niconico" aria-label="${esc(NICO_VIDEO_WATCH_CARD_TITLE)}">` +
    viewerBehaviorBoardInnerHtml(model.behavior) +
    `<h2 class="nlsb-video-watch-card__title">${esc(NICO_VIDEO_WATCH_CARD_TITLE)}</h2>` +
    `<p class="nlsb-video-watch-card__views"><span class="nlsb-video-watch-card__label">再生</span> ${esc(model.viewCountText)}</p>` +
    `<p class="nlsb-video-watch-card__recorded">${esc(model.recordedSummary)}</p>` +
    `</section>`
  );
}
