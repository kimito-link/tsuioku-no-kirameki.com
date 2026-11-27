/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】YouTube の通常動画ページに出すカードの文言と HTML
 * 【この箱に入らないもの】fetch / storage / chrome.* / 新しい Observer
 * 【書けるstorageキー】なし
 * 【正本宣言】動画モードのカードに出す言葉はこのファイル
 */

import {
  estimateYoutubeSupportSpendJpy,
  estimateStreamerTakeHomeJpy,
  formatEstimatedViewerSpendDisplay,
  formatStreamerTakeHomeDisplay,
} from '../estimatedViewerSpend.js';
import { attachRepliesToPeople, buildViewerBehaviorBoard, viewerBehaviorBoardInnerHtml } from '../viewerBehavior.js';
import { matchVideoCommentersToLive, tallyVisibleSuperThanks } from './ytVideoWatchMeta.js';
import { attachVideoCommentsToPeople } from '../videoWatch/videoCommentDetail.js';
import { videoCommentRowsForStore } from '../videoWatch/videoCommentRows.js';

/** カードの見出し */
export const YT_VIDEO_WATCH_CARD_TITLE = 'この動画のデータ';

/**
 * @typedef {{
 *   videoId: string,
 *   kind: 'video',
 *   title: string,
 *   viewCount: number | null,
 *   viewCountText: string,
 *   recordedStreams: number,
 *   recordedComments: number,
 *   recordedSummary: string,
 *   videoAuthorCount: number,
 *   matchedCount: number,
 *   matchSummary: string,
 *   matchedNames: string[],
 *   superThanksCount: number,
 *   spend: ReturnType<typeof formatEstimatedViewerSpendDisplay> | null,
 *   takeHome: ReturnType<typeof formatStreamerTakeHomeDisplay> | null,
 *   behavior?: any,
 *   videoRows?: any[],
 * }} YtVideoWatchCardModel
 */

/**
 * @param {{
 *   videoId?: string,
 *   title?: string,
 *   viewCount?: number | null,
 *   recorded?: { streamCount?: number, itemCount?: number },
 *   videoAuthors?: readonly any[],
 *   livePeople?: Map<string, any> | Record<string, any> | null,
 *   spend?: any,
 *   takeHome?: any,
 *   videoComments?: readonly any[],
 *   nowMs?: number,
 * }} input
 * @returns {YtVideoWatchCardModel}
 */
export function buildYtVideoWatchCardModel(input) {
  const src = input && typeof input === 'object' ? input : {};
  // v0.1.2241: 読めなかった(null)を 0 回にしない(Number(null) は 0)
  const viewCount = src.viewCount != null && String(src.viewCount) !== '' && Number.isFinite(Number(src.viewCount)) && Number(src.viewCount) >= 0
    ? Math.floor(Number(src.viewCount))
    : null;
  const recorded = src.recorded && typeof src.recorded === 'object' ? src.recorded : {};
  const streamCount = Math.max(0, Math.floor(Number(recorded.streamCount) || 0));
  const itemCount = Math.max(0, Math.floor(Number(recorded.itemCount) || 0));
  const overlap = matchVideoCommentersToLive(src.videoAuthors || [], src.livePeople || {});
  const thanks = tallyVisibleSuperThanks(src.videoAuthors || []);
  const spend = src.spend || formatEstimatedViewerSpendDisplay(estimateYoutubeSupportSpendJpy(thanks.amounts));
  const takeHome = src.takeHome || formatStreamerTakeHomeDisplay('youtube', estimateStreamerTakeHomeJpy('youtube', { amounts: thanks.amounts }));
  // v0.1.2263: 動画ページで「まだ記録していません」と否定から入らない(りんく 11-27「youtubeなのにこちらの配信を記録してないとか」)。
  //   配信の記録があるときだけ、その事実を1行。無いときは何も出さない(この動画のコメントと人が主役)。
  let recordedSummary = '';
  if (streamCount > 0) {
    recordedSummary = `このチャンネルの配信を、このPCで ${streamCount.toLocaleString('ja-JP')} 本記録しています（コメント合計 ${itemCount.toLocaleString('ja-JP')} 件）。`;
  }
  // v0.1.2245: 未ログインの YouTube は投稿者が @名前 だけ(UC… が無い)。照合の数(UC… だけ)を「見えている人数」に使うと、
  //   顔は 20 人並ぶのに 0 人扱いになっていた(kKl0E22tU78 実機)。人数は横の欄に並べる人と同じ数え方にそろえる。
  const shownAuthorIds = new Set();
  for (const a of Array.isArray(src.videoAuthors) ? src.videoAuthors : []) {
    const id = String(a?.channelId || a?.id || a?.handle || '').trim();
    if (id) shownAuthorIds.add(id);
  }
  const videoAuthorCount = Math.max(overlap.videoAuthorCount, shownAuthorIds.size);
  let matchSummary = '';
  if (videoAuthorCount === 0) {
    matchSummary = 'コメント欄が読み込まれると、ここに書いた人が並びます。';
  } else if (streamCount === 0) {
    matchSummary = `いま見えているコメントの投稿者は ${videoAuthorCount.toLocaleString('ja-JP')} 人です。`;
  } else if (overlap.matchedCount === 0) {
    matchSummary = `いま見えている ${videoAuthorCount.toLocaleString('ja-JP')} 人のうち、このチャンネルの配信でもコメントしていた人はまだ見つかりません。`;
  } else {
    matchSummary = `いま見えている ${videoAuthorCount.toLocaleString('ja-JP')} 人のうち、${overlap.matchedCount.toLocaleString('ja-JP')} 人はこのチャンネルの配信でもコメントしていました。`;
  }
  const matchedNames = overlap.matched
    .map((m) => m.name || m.channelId)
    .filter(Boolean)
    .slice(0, 5);
  const authors = Array.isArray(src.videoAuthors) ? src.videoAuthors : [];
  const livePeople = src.livePeople || {};
  const histCount = livePeople instanceof Map ? livePeople.size : Object.keys(livePeople || {}).length;
  const visiblePeople = attachRepliesToPeople(authors.map((a) => ({
      // v0.1.2241: 未ログインの YouTube のコメント欄は、投稿者のリンクが /@名前 だけ(UC… が無い・kKl0E22tU78 実測)。
      //   UC… が無い人を id 空=匿名にまとめていたため、横の欄が「匿名 39人」の1枚になっていた。@名前 でも一人ずつ並べる。
      id: String(a?.channelId || a?.id || a?.handle || '').trim(),
      name: String(a?.name || '').trim(),
      avatarUrl: String(a?.avatarUrl || '').trim(),
      commentCount: Number(a?.commentCount) > 0 ? Math.floor(Number(a.commentCount)) : 1,
      giftCount: Number(a?.amount) > 0 ? 1 : null,
      knownAmountJpy: String(a?.currency || '').toUpperCase() === 'JPY' && Number(a?.amount) > 0 ? Math.floor(Number(a.amount)) : null,
      at: Number(a?.postedAtMs || a?.at) > 0 ? Math.floor(Number(a.postedAtMs || a.at)) : 0,
      pending: a?.pending === true,
      commentAnchor: String(a?.commentId || '').trim(),
      creatorReplies: a?.creatorReplies,
      viewerReplies: a?.viewerReplies,
      replies: a?.replies,
      channelId: String(a?.channelId || '').trim(),
      handle: String(a?.handle || '').trim(),
      channelUrl: ytChannelUrlOf(a),
    })), src.videoComments);
  // v0.1.2263: サムネイルを押したときに出す「この動画で書いたこと」(本文・いいね・返信)。ページの行だけ・作らない。
  const peopleWithComments = attachVideoCommentsToPeople(visiblePeople, src.videoComments);
  const behavior = buildViewerBehaviorBoard({
    visiblePeople: peopleWithComments,
    historyById: livePeople,
    historyReady: streamCount > 0 || histCount > 0,
    nowMs: src.nowMs,
    viewCount,
    spend,
    takeHome,
    platform: 'youtube',
    contentKind: 'video',
  });

  return {
    videoId: String(src.videoId || '').trim(),
    kind: 'video',
    title: String(src.title || '').replace(/\s+/g, ' ').trim(),
    viewCount,
    viewCountText: viewCount == null ? '—' : `${viewCount.toLocaleString('ja-JP')} 回`,
    recordedStreams: streamCount,
    recordedComments: itemCount,
    recordedSummary,
    videoAuthorCount,
    matchedCount: overlap.matchedCount,
    matchSummary,
    matchedNames,
    superThanksCount: thanks.count,
    spend,
    takeHome,
    behavior,
    // 会場モード・マーケHTML・コメビュが、この動画のコメントを記録の行と同じ形で読む(videoCommentRows.js)
    videoRows: videoCommentRowsForStore(src.videoComments, { videoId: String(src.videoId || '').trim(), platform: 'youtube' }),
  };
}

/** @param {any} a @returns {string} */
function ytChannelUrlOf(a) {
  const ch = String(a?.channelId || '').trim();
  if (/^UC[A-Za-z0-9_-]{22}$/.test(ch)) return `https://www.youtube.com/channel/${ch}`;
  const h = String(a?.handle || (String(a?.id || '').startsWith('@') ? a.id : '')).trim();
  return /^@[^\s/?#]{1,100}$/.test(h) ? `https://www.youtube.com/${encodeURIComponent(h).replace(/^%40/, '@')}` : '';
}

/**
 * カードの内側 HTML（呼び出し側で枠に入れる）。HTML 特殊文字は逃がす。
 * @param {YtVideoWatchCardModel | null | undefined} model
 * @returns {string}
 */
export function ytVideoWatchCardInnerHtml(model) {
  if (!model || model.kind !== 'video') return '';
  const esc = (/** @type {unknown} */ s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const names = model.matchedNames.length
    ? `<p class="nlsb-video-watch-card__names">${model.matchedNames.map(esc).join('、')}</p>`
    : '';
  const thanks = [];
  if (model.superThanksCount > 0) {
    thanks.push(`<p>スーパーサンクス ${esc(model.superThanksCount.toLocaleString('ja-JP'))} 件（いま見えている範囲）</p>`);
    if (model.spend && model.spend.text) {
      thanks.push(`<p title="${esc(model.spend.title || '')}">${esc(model.spend.label || '推定（視聴者の購入額）')} ${esc(model.spend.text)}</p>`);
    }
    if (model.takeHome && model.takeHome.text) {
      thanks.push(`<p title="${esc(model.takeHome.title || '')}">${esc(model.takeHome.label || '推定（配信者の受取）')} ${esc(model.takeHome.text)}</p>`);
    }
  }
  return (
    `<section class="nlsb-video-watch-card" data-video-id="${esc(model.videoId)}" aria-label="${esc(YT_VIDEO_WATCH_CARD_TITLE)}">` +
    viewerBehaviorBoardInnerHtml(model.behavior) +
    `<h2 class="nlsb-video-watch-card__title">${esc(YT_VIDEO_WATCH_CARD_TITLE)}</h2>` +
    `<p class="nlsb-video-watch-card__views"><span class="nlsb-video-watch-card__label">再生</span> ${esc(model.viewCountText)}</p>` +
    (model.recordedSummary ? `<p class="nlsb-video-watch-card__recorded">${esc(model.recordedSummary)}</p>` : '') +
    (model.matchSummary ? `<p class="nlsb-video-watch-card__match">${esc(model.matchSummary)}</p>` : '') +
    names +
    thanks.join('') +
    `</section>`
  );
}
