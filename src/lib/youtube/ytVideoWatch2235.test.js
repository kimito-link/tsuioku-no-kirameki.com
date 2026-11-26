import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { concurrentFromVideoViewCountRenderer, concurrentViewersInInnertube } from './ytConcurrentViewers.js';
import { mergeYtStreamSummary } from './ytStreamStorePolicy.js';
import {
  classifyYtWatchContentKind,
  ytViewCountFromDom,
  ytCommentCountFromDom,
  ytVideoCommentAuthorsFromDom,
  ytWatchMayShowConcurrentViewers,
  concurrentViewersIsViewCountLeak,
  ytPageShouldHideVenueMode,
  parseYtCommentPublishedAtMs,
} from './ytVideoWatchMeta.js';
import { buildYtVideoWatchCardModel } from './ytVideoWatchCard.js';
import { viewerBehaviorRowsToLaneBuckets } from '../../extension/viewerBehaviorLiveLayout.js';
import { parseYtVideoIdFromUrl } from './ytPageMeta.js';
import { venueItemsForPlatform } from '../platform/platformMetrics.js';
import { ytSummaryToNicoSnapshot } from '../../../extension-youtube/src/ytNicoShim.js';

const MIX_VOD = 'SIk45QZsnDM';
const VIEWS_VOD = 'mlfY1WYFpEc';

describe('同時視聴者数は通常動画では出さない (0.1.2235)', () => {
  it('list= と start_radio の2本とも、v= の動画IDを取る', () => {
    expect(parseYtVideoIdFromUrl(`https://www.youtube.com/watch?v=${MIX_VOD}&list=RD${MIX_VOD}&start_radio=1`)).toBe(MIX_VOD);
    expect(parseYtVideoIdFromUrl(`https://www.youtube.com/watch?v=${VIEWS_VOD}&list=RD${VIEWS_VOD}&start_radio=1`)).toBe(VIEWS_VOD);
  });

  it('再生回数の renderer（回視聴 / originalViewCount）を同時視聴にしない', () => {
    expect(concurrentFromVideoViewCountRenderer({
      viewCount: { simpleText: '13万回視聴' },
      originalViewCount: 135321,
      isLive: true,
    })).toBeNull();
    expect(concurrentFromVideoViewCountRenderer({
      viewCount: { simpleText: '135,321 回視聴' },
      originalViewCount: '135321',
    })).toBeNull();
  });

  it('人が視聴中のときだけ同時視聴を返す', () => {
    expect(concurrentFromVideoViewCountRenderer({
      viewCount: { simpleText: '1,190人が視聴中' },
    })).toBe(1190);
  });

  it('古い live の 1,190 が残っていても、公式が配信でない list= 動画では消して通常動画にする', () => {
    const stale = mergeYtStreamSummary(undefined, {
      videoId: MIX_VOD,
      contentKind: 'live',
      concurrentViewers: 1190,
    }, 1);
    expect(stale.contentKind).toBe('live');
    const fixed = mergeYtStreamSummary(stale, {
      videoId: MIX_VOD,
      contentKind: 'video',
      isLive: false,
      isLiveContent: false,
      slotViewCount: 12345,
      sourceUrl: `https://www.youtube.com/watch?v=${MIX_VOD}&list=RD${MIX_VOD}&start_radio=1`,
    }, 2);
    expect(fixed.contentKind).toBe('video');
    expect(fixed.concurrentViewers).toBeNull();
    expect(ytWatchMayShowConcurrentViewers({ contentKind: fixed.contentKind, isLive: false })).toBe(false);
  });

  it('再生回数 135,321 を同時視聴として残した古い live も、同じ再生回数の通常動画に直す', () => {
    const stale = mergeYtStreamSummary(undefined, {
      videoId: VIEWS_VOD,
      contentKind: 'live',
      concurrentViewers: 135321,
    }, 1);
    const fixed = mergeYtStreamSummary(stale, {
      videoId: VIEWS_VOD,
      slotViewCount: 135321,
      isLive: false,
      isLiveContent: false,
    }, 2);
    expect(fixed.contentKind).toBe('video');
    expect(fixed.concurrentViewers).toBeNull();
    expect(concurrentViewersIsViewCountLeak(135321, 135321)).toBe(true);
  });

  it('分類は、再生回数と同じ数を同時視聴と見て live にしない', () => {
    expect(classifyYtWatchContentKind({
      url: `https://www.youtube.com/watch?v=${VIEWS_VOD}&list=RD${VIEWS_VOD}&start_radio=1`,
      concurrentViewers: 135321,
      viewCount: 135321,
    })).toBe('video');
  });

  it('横の欄の見出しは、再生回数の取り違えでも同時視聴者数にしない', () => {
    const items = venueItemsForPlatform('youtube', {
      records: { text: '0', isPlaceholder: false },
      concurrent: { text: '135,321', isPlaceholder: false },
      streamAge: { text: '—', isPlaceholder: true },
      facts: { contentKind: 'live', viewers: 135321, viewCount: 135321 },
    });
    expect(items.find((i) => i.key === 'concurrent').label).toBe('再生');
    expect(items.find((i) => i.key === 'concurrent').text).toBe('135,321');
    expect(items.find((i) => i.label === '同時視聴者数')).toBeUndefined();
  });

  it('ytNicoShim は通常動画の公式同時視聴を出さない', () => {
    const snap = ytSummaryToNicoSnapshot({
      contentKind: 'video',
      concurrentViewers: 135321,
      slotViewCount: 135321,
    }, VIEWS_VOD, 't');
    expect(snap.officialViewerCount).toBeNull();
    expect(snap.platformFacts.contentKind).toBe('video');
  });
});

describe('2026 のコメント DOM（スレッド > view-model）', () => {
  it('#author-thumbnail と #author-text から投稿者と顔を取る', () => {
    const win = new Window();
    const doc = win.document;
    doc.body.innerHTML = `
      <ytd-comments-header-renderer><div id="count">19 件のコメント</div></ytd-comments-header-renderer>
      <ytd-comment-thread-renderer>
        <ytd-comment-view-model comment-id="UgxdOLD">
          <div id="author-thumbnail"><img src="https://yt3.ggpht.com/old.jpg" alt=""></div>
          <yt-formatted-string id="author-text">@hanako</yt-formatted-string>
          <a href="/channel/UCaaaaaaaaaaaaaaaaaaaaaa"></a>
          <yt-formatted-string id="published-time-text" aria-label="3 日前">3 日前</yt-formatted-string>
        </ytd-comment-view-model>
      </ytd-comment-thread-renderer>
      <ytd-comment-thread-renderer>
        <ytd-comment-view-model comment-id="UgxdNEW">
          <div id="author-thumbnail"><img src="https://yt3.ggpht.com/new.jpg" alt=""></div>
          <yt-formatted-string id="author-text">@atarashii</yt-formatted-string>
          <a href="/channel/UCbbbbbbbbbbbbbbbbbbbbbb"></a>
          <yt-formatted-string id="published-time-text">1 時間前</yt-formatted-string>
        </ytd-comment-view-model>
      </ytd-comment-thread-renderer>
    `;
    expect(ytCommentCountFromDom(doc)).toBe(19);
    const now = Date.parse('2026-11-26T10:00:00+09:00');
    const authors = ytVideoCommentAuthorsFromDom(doc, { nowMs: now });
    expect(authors).toHaveLength(2);
    expect(authors[0].channelId).toBe('UCbbbbbbbbbbbbbbbbbbbbbb');
    expect(authors[0].name).toContain('atarashii');
    expect(authors[0].avatarUrl).toContain('new.jpg');
    expect(authors[0].postedAtMs).toBe(parseYtCommentPublishedAtMs('1 時間前', now));
    expect(authors[1].channelId).toBe('UCaaaaaaaaaaaaaaaaaaaaaa');
    expect(authors[1].postedAtMs).toBe(parseYtCommentPublishedAtMs('3 日前', now));
  });
});

describe('通常の動画では会場モードを出さない', () => {
  it('contentKind が video なら隠す。配信とアーカイブでは出してよい', () => {
    expect(ytPageShouldHideVenueMode({ contentKind: 'video' })).toBe(true);
    expect(ytPageShouldHideVenueMode({ isLive: false, isLiveContent: false })).toBe(true);
    expect(ytPageShouldHideVenueMode({ contentKind: 'live', isLive: true })).toBe(false);
    expect(ytPageShouldHideVenueMode({ contentKind: 'live_replay', isLive: false, isLiveContent: true })).toBe(false);
    expect(ytPageShouldHideVenueMode({})).toBe(false);
  });
});

describe('カードに渡した投稿時刻でも、動画の顔は新しい順', () => {
  it('postedAtMs でも at でも、新しい人が先でなじみの印は残る', () => {
    const NOW = Date.parse('2026-11-26T10:00:00+09:00');
    const FIRST = Date.parse('2026-11-03T12:00:00+09:00');
    const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
    const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
    const card = buildYtVideoWatchCardModel({
      videoId: 'SIk45QZsnDM',
      viewCount: 12345,
      videoAuthors: [
        { channelId: A, name: '花子', at: NOW - 3600_000 },
        { channelId: B, name: '新しい人', postedAtMs: NOW, amount: 500, currency: 'JPY' },
      ],
      livePeople: { [A]: { n: '花子', c: 12, t: NOW, f: FIRST, lv: 3, seenLive: true } },
      nowMs: NOW,
    });
    expect(card.behavior.contentKind).toBe('video');
    const buckets = viewerBehaviorRowsToLaneBuckets(card.behavior);
    expect(buckets.tanu.map((i) => i.title)).toEqual(['新しい人', '花子']);
    expect(buckets.tanu[0].meta.idLine).toContain('ギフト');
    expect(buckets.tanu[1].meta.idLine).toContain('なじみ');
  });
});
