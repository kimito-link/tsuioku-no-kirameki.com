import { describe, it, expect } from 'vitest';
import { concurrentFromVideoViewCountRenderer } from './ytConcurrentViewers.js';
import {
  isYtShortsUrl,
  isYtWatchOrShortsUrl,
  parseYtViewCountFromText,
  viewCountFromVideoViewCountRenderer,
  viewCountInInnertube,
  classifyYtWatchContentKind,
  parseYtPaidCommentAmount,
  ytVideoCommentAuthorsFromInnertube,
  ytVideoCommentAuthorsFromDom,
  summarizeChannelRecordedLives,
  liveCommenterMapFromRows,
  matchVideoCommentersToLive,
  tallyVisibleSuperThanks,
} from './ytVideoWatchMeta.js';
import { isYtWatchLikeUrl, parseYtVideoIdFromUrl } from './ytPageMeta.js';

describe('isYtShortsUrl / isYtWatchOrShortsUrl', () => {
  it('Shorts の URL だけ真', () => {
    expect(isYtShortsUrl('https://www.youtube.com/shorts/abcdefghijk')).toBe(true);
    expect(isYtShortsUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(false);
    expect(isYtShortsUrl('https://www.youtube.com/shorts/short')).toBe(false);
  });
  it('watch と Shorts は真・ライブチャットとトップは偽', () => {
    expect(isYtWatchOrShortsUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(isYtWatchOrShortsUrl('https://www.youtube.com/shorts/abcdefghijk')).toBe(true);
    expect(isYtWatchOrShortsUrl('https://www.youtube.com/live/abcdefghijk')).toBe(true);
    expect(isYtWatchOrShortsUrl('https://www.youtube.com/live_chat?v=abcdefghijk')).toBe(false);
    expect(isYtWatchOrShortsUrl('https://www.youtube.com/')).toBe(false);
  });
});

describe('isYtWatchLikeUrl に Shorts を足しても、従来の watch / live は変わらない', () => {
  it('既存の真偽はそのまま・Shorts だけ新たに真', () => {
    expect(isYtWatchLikeUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(isYtWatchLikeUrl('https://www.youtube.com/live/abcdefghijk')).toBe(true);
    expect(isYtWatchLikeUrl('https://www.youtube.com/live_chat?v=abcdefghijk')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.youtube.com/')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.youtube.com/@testchan/live')).toBe(true);
    expect(isYtWatchLikeUrl('https://www.youtube.com/feed/live')).toBe(false);
    expect(isYtWatchLikeUrl('https://www.youtube.com/shorts/abcdefghijk')).toBe(true);
    expect(parseYtVideoIdFromUrl('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk');
  });
});

describe('parseYtViewCountFromText', () => {
  it('日本語と英語の総再生を読む', () => {
    expect(parseYtViewCountFromText('1,234,567 回視聴')).toBe(1234567);
    expect(parseYtViewCountFromText('123万回視聴')).toBe(1230000);
    expect(parseYtViewCountFromText('1.2万 回視聴')).toBe(12000);
    expect(parseYtViewCountFromText('1.5M views')).toBe(1500000);
    expect(parseYtViewCountFromText('123,456 views')).toBe(123456);
  });
  it('同時視聴の文は捨てる', () => {
    expect(parseYtViewCountFromText('1,234 人が視聴中')).toBeNull();
    expect(parseYtViewCountFromText('1,234 watching')).toBeNull();
    expect(parseYtViewCountFromText('')).toBeNull();
  });
});

describe('viewCountFromVideoViewCountRenderer はライブの同時視聴を総再生にしない', () => {
  it('通常動画の originalViewCount と表示文', () => {
    expect(viewCountFromVideoViewCountRenderer({ isLive: false, originalViewCount: '8900', viewCount: { simpleText: '8,900 回視聴' } })).toBe(8900);
    expect(viewCountFromVideoViewCountRenderer({ isLive: true, originalViewCount: 1234, viewCount: { simpleText: '1,234 人が視聴中' } })).toBeNull();
    // 既存の同時視聴パーサはライブだけ数を返す（回帰）
    expect(concurrentFromVideoViewCountRenderer({ isLive: true, originalViewCount: 1234, viewCount: { simpleText: '1,234 人が視聴中' } })).toBe(1234);
    expect(concurrentFromVideoViewCountRenderer({ isLive: false, originalViewCount: 8900, viewCount: { simpleText: '8,900 回視聴' } })).toBeNull();
  });
  it('木を歩いて動画 ID が一致する総再生だけ返す', () => {
    const data = {
      videoId: 'abcdefghijk',
      contents: { videoViewCountRenderer: { isLive: false, viewCount: { simpleText: '42 回視聴' } } },
    };
    expect(viewCountInInnertube(data, 'abcdefghijk')).toBe(42);
    expect(viewCountInInnertube(data, 'zzzzzzzzzzz')).toBeNull();
  });
});

describe('classifyYtWatchContentKind', () => {
  it('ライブ信号があれば live、終わった配信は live_replay、通常動画だけ video', () => {
    expect(classifyYtWatchContentKind({ isLive: true, concurrentViewers: 10 })).toBe('live');
    expect(classifyYtWatchContentKind({ hasLiveChat: true })).toBe('live');
    expect(classifyYtWatchContentKind({ hasLiveChatReplay: true })).toBe('live_replay');
    expect(classifyYtWatchContentKind({ isLive: false, isLiveContent: true })).toBe('live_replay');
    expect(classifyYtWatchContentKind({ isLive: false, isLiveContent: false })).toBe('video');
    expect(classifyYtWatchContentKind({ existingItemCount: 12, isLive: false })).toBe('live_replay');
    expect(classifyYtWatchContentKind({ existingItemCount: 12, isLive: false, isLiveContent: false })).toBe('video');
    expect(classifyYtWatchContentKind({})).toBe('unknown');
    expect(classifyYtWatchContentKind({ url: 'https://www.youtube.com/shorts/abcdefghijk' })).toBe('video');
    expect(classifyYtWatchContentKind({ url: 'https://www.youtube.com/shorts/abcdefghijk', isLive: true })).toBe('live');
  });
});

describe('コメント投稿者と交差', () => {
  it('innertube の commentRenderer から UC と名前とサンクス金額を取る（本文は使わない）', () => {
    const data = {
      frameworkUpdates: {
        entityBatchUpdate: {
          mutations: [
            {
              payload: {
                commentEntityPayload: {},
              },
            },
          ],
        },
      },
      onResponseReceivedEndpoints: [
        {
          reloadContinuationItemsCommand: {
            continuationItems: [
              {
                commentThreadRenderer: {
                  comment: {
                    commentRenderer: {
                      authorText: { simpleText: '花子' },
                      authorExternalChannelId: 'UCabcdefghijklmnopqrstuv',
                      authorEndpoint: { browseEndpoint: { browseId: 'UCabcdefghijklmnopqrstuv' } },
                      purchaseAmount: { simpleText: '¥500' },
                    },
                  },
                },
              },
              {
                commentThreadRenderer: {
                  comment: {
                    commentRenderer: {
                      authorText: { simpleText: '太郎' },
                      authorExternalChannelId: 'UCbbbbbbbbbbbbbbbbbbbbbb',
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    };
    const authors = ytVideoCommentAuthorsFromInnertube(data);
    expect(authors).toEqual([
      { channelId: 'UCabcdefghijklmnopqrstuv', handle: '', name: '花子', amount: 500, currency: 'JPY' },
      { channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb', handle: '', name: '太郎', amount: null, currency: '' },
    ]);
    expect(tallyVisibleSuperThanks(authors)).toEqual({ count: 1, amounts: { JPY: 500 } });
  });

  it('DOM のコメントスレッドから投稿者を取る', () => {
    const thread = (href, name) => ({
      querySelector: (sel) => (/author|#name|name/.test(String(sel)) ? { textContent: name } : null),
      querySelectorAll: (sel) => (String(sel).includes('href') ? [{ getAttribute: () => href }] : []),
    });
    const root = {
      querySelector: () => null,
      querySelectorAll: (sel) => (String(sel).includes('comment') ? [thread('/channel/UCabcdefghijklmnopqrstuv', '花子'), thread('/@taro-chan', '太郎')] : []),
    };
    const authors = ytVideoCommentAuthorsFromDom(root);
    expect(authors[0]).toMatchObject({ channelId: 'UCabcdefghijklmnopqrstuv', name: '花子' });
    expect(authors[1]).toMatchObject({ handle: '@taro-chan', name: '太郎', channelId: '' });
  });

  it('同じ UC の配信コメントと交差する。記録が無い人は入れない', () => {
    const live = liveCommenterMapFromRows([
      { channelId: 'UCabcdefghijklmnopqrstuv', name: '花子', postedAtMs: 1 },
      { channelId: 'UCabcdefghijklmnopqrstuv', name: '花子', postedAtMs: 2 },
      { channelId: 'UCcccccccccccccccccccccc', name: '別の人' },
    ]);
    const overlap = matchVideoCommentersToLive(
      [
        { channelId: 'UCabcdefghijklmnopqrstuv', name: '花子', amount: null, currency: '', handle: '' },
        { channelId: 'UCdddddddddddddddddddddd', name: '動画だけ', amount: null, currency: '', handle: '' },
      ],
      live,
    );
    expect(overlap.videoAuthorCount).toBe(2);
    expect(overlap.matchedCount).toBe(1);
    expect(overlap.matched[0]).toEqual({ channelId: 'UCabcdefghijklmnopqrstuv', name: '花子', liveComments: 2 });
  });
});

describe('summarizeChannelRecordedLives', () => {
  it('同じチャンネルでコメント記録がある配信だけ数える。動画扱いの要約は除く', () => {
    const sum = summarizeChannelRecordedLives(
      {
        abcdefghijk: { broadcasterChannelId: 'UCabcdefghijklmnopqrstuv', itemCount: 10, updatedAt: 20 },
        lmnopqrstuv: { broadcasterChannelId: 'UCabcdefghijklmnopqrstuv', itemCount: 5, updatedAt: 30 },
        zzzzzzzzzzz: { broadcasterChannelId: 'UCabcdefghijklmnopqrstuv', itemCount: 3, contentKind: 'video', updatedAt: 40 },
        aaaaaaaaaaa: { broadcasterChannelId: 'UCbbbbbbbbbbbbbbbbbbbbbb', itemCount: 99, updatedAt: 50 },
        'tw.someone.12345': { broadcasterChannelId: 'UCabcdefghijklmnopqrstuv', itemCount: 1, updatedAt: 60 },
      },
      'UCabcdefghijklmnopqrstuv',
    );
    expect(sum.streamCount).toBe(2);
    expect(sum.itemCount).toBe(15);
    expect(sum.videoIds).toEqual(['lmnopqrstuv', 'abcdefghijk']);
  });
});

describe('parseYtPaidCommentAmount', () => {
  it('円とドルの表示を読む。形が違えば null', () => {
    expect(parseYtPaidCommentAmount({ purchaseAmount: { simpleText: '¥1,200' } })).toEqual({ amount: 1200, currency: 'JPY' });
    expect(parseYtPaidCommentAmount({ amount: '$2.00' })).toEqual({ amount: 2, currency: 'USD' });
    expect(parseYtPaidCommentAmount({ amount: 'ありがとう' })).toBeNull();
    expect(parseYtPaidCommentAmount(null)).toBeNull();
  });
});
