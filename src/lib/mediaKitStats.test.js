import { describe, expect, it } from 'vitest';
import { buildMediaKitStats, buildMediaKitSupporters } from './mediaKitStats.js';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 5, 10, 12, 0, 0);

function row(liveId, daysAgo, minute, over = {}) {
  return {
    liveId,
    capturedAt: NOW - daysAgo * DAY + minute * MIN,
    commentStorageCount: 0,
    uniqueKnownCommenters: 0,
    peakConcurrentEstimate: null,
    officialCommentCount: null,
    officialViewerCount: null,
    viewerCountFromDom: null,
    ...over
  };
}

describe('buildMediaKitStats', () => {
  it('30/60/90日へ最終サンプル基準で配信を帰属し、枠ごとの値を集計する', () => {
    const stats = buildMediaKitStats({
      nowMs: NOW,
      summaryRows: [
        row('lv1', 10, 0, {
          peakConcurrentEstimate: 10,
          broadcasterName: '配信者A',
          broadcasterUserId: '123',
          broadcasterIconUrl: 'https://example.test/a.png'
        }),
        row('lv1', 10, 60, {
          peakConcurrentEstimate: 30,
          officialViewerCount: 100,
          officialCommentCount: 120,
          uniqueKnownCommenters: 12
        }),
        row('lv2', 45, 0, { peakConcurrentEstimate: 20 }),
        row('lv2', 45, 120, {
          peakConcurrentEstimate: 40,
          viewerCountFromDom: 200,
          commentStorageCount: 60,
          uniqueKnownCommenters: 18
        }),
        row('lv3', 80, 0, { peakConcurrentEstimate: 5 }),
        row('lv3', 80, 30, {
          peakConcurrentEstimate: 15,
          officialViewerCount: 50,
          officialCommentCount: 30,
          uniqueKnownCommenters: 7
        }),
        row('outside', 91, 0, { officialViewerCount: 999 })
      ],
      profileSnapshots: [
        { liveId: 'lv3', capturedAt: NOW - 80 * DAY, followerCount: 90 },
        { liveId: 'lv2', capturedAt: NOW - 45 * DAY, followerCount: 100 },
        {
          liveId: 'lv1',
          capturedAt: NOW - 10 * DAY,
          followerCount: 125,
          nickname: '最新プロフィール名'
        }
      ],
      giftEventsByLive: {
        lv1: [{ point: 100 }, { point: 250 }],
        lv2: [{ point: 500 }],
        lv3: []
      }
    });

    expect(stats.broadcaster).toEqual({
      name: '最新プロフィール名',
      userId: '123',
      iconUrl: 'https://example.test/a.png'
    });
    expect(stats.windows.map((window) => window.liveCount)).toEqual([1, 2, 3]);

    const [d30, d60, d90] = stats.windows;
    expect(d30.followers).toBe(125);
    expect(d30.followersGained).toBeNull();
    expect(d30.avgConcurrent).toBe(20);
    expect(d30.maxConcurrent).toBe(30);
    expect(d30.visitors).toEqual({ total: 100, average: 100 });
    expect(d30.comments).toBe(120);
    expect(d30.chatRatePerMin).toBe(2);
    expect(d30.uniqueSupporters).toBe(12);
    expect(d30.giftPoints).toBe(350);
    expect(d30.giftCount).toBe(2);
    expect(d30.broadcastsPerWeek).toBeCloseTo(7 / 30);

    expect(d60.followersGained).toBe(25);
    expect(d60.avgConcurrent).toBe(25);
    expect(d60.maxConcurrent).toBe(40);
    expect(d60.visitors).toEqual({ total: 300, average: 150 });
    expect(d60.comments).toBe(180);
    expect(d60.chatRatePerMin).toBe(1);
    expect(d60.uniqueSupporters).toBe(18);
    expect(d60.giftPoints).toBe(850);
    expect(d60.giftCount).toBe(3);

    expect(d90.followersGained).toBe(35);
    expect(d90.avgConcurrent).toBe(20);
    expect(d90.visitors).toEqual({ total: 350, average: 350 / 3 });
    expect(d90.comments).toBe(210);
    expect(d90.chatRatePerMin).toBe(1);
    expect(d90.uniqueSupporters).toBe(18);
    expect(d90.giftPoints).toBe(850);
    expect(d90.giftCount).toBe(3);
  });

  it('公式値を優先し、0は取得済みの値として保持する', () => {
    const stats = buildMediaKitStats({
      nowMs: NOW,
      windowsDays: [30],
      summaryRows: [
        row('lv1', 1, 0, { peakConcurrentEstimate: 0 }),
        row('lv1', 1, 10, {
          peakConcurrentEstimate: 0,
          officialViewerCount: 0,
          viewerCountFromDom: 99,
          officialCommentCount: 0,
          commentStorageCount: 88,
          uniqueKnownCommenters: 0
        })
      ],
      profileSnapshots: [
        { liveId: 'lv1', capturedAt: NOW - DAY, followerCount: 0 }
      ],
      giftEventsByLive: { lv1: [] }
    }).windows[0];

    expect(stats.followers).toBe(0);
    expect(stats.avgConcurrent).toBe(0);
    expect(stats.maxConcurrent).toBe(0);
    expect(stats.visitors).toEqual({ total: 0, average: 0 });
    expect(stats.comments).toBe(0);
    expect(stats.chatRatePerMin).toBe(0);
    expect(stats.uniqueSupporters).toBe(0);
    expect(stats.giftPoints).toBe(0);
    expect(stats.giftCount).toBe(0);
  });

  it('データ欠損はnull、配信なしは頻度もnullにして誤魔化さない', () => {
    const stats = buildMediaKitStats({
      nowMs: NOW,
      windowsDays: [30],
      summaryRows: [],
      profileSnapshots: [],
      giftEventsByLive: {}
    });

    expect(stats.broadcaster).toEqual({ name: '', userId: '', iconUrl: '' });
    expect(stats.windows[0]).toEqual({
      days: 30,
      followers: null,
      followersGained: null,
      avgConcurrent: null,
      maxConcurrent: null,
      visitors: null,
      comments: null,
      chatRatePerMin: null,
      uniqueSupporters: null,
      giftPoints: null,
      giftCount: null,
      broadcastsPerWeek: null,
      liveCount: 0
    });
  });

  it('平均同接はサンプル数で重み付けせず、配信ごとの平均をさらに平均する', () => {
    const stats = buildMediaKitStats({
      nowMs: NOW,
      windowsDays: [30],
      summaryRows: [
        row('lv1', 1, 0, { peakConcurrentEstimate: 10 }),
        row('lv1', 1, 10, { peakConcurrentEstimate: 20 }),
        row('lv1', 1, 20, { peakConcurrentEstimate: 30 }),
        row('lv2', 2, 0, { peakConcurrentEstimate: 100 }),
        row('lv2', 2, 10, { peakConcurrentEstimate: 100 })
      ]
    }).windows[0];

    expect(stats.avgConcurrent).toBe(60);
    expect(stats.maxConcurrent).toBe(100);
  });

  it('未来行と期間外行を除外し、同じ期間指定は重複させない', () => {
    const stats = buildMediaKitStats({
      nowMs: NOW,
      windowsDays: [30, 30, -1, 0],
      summaryRows: [
        row('future', -1, 0, { officialCommentCount: 10 }),
        row('boundary', 30, 0, { officialCommentCount: 5 }),
        row('old', 31, 0, { officialCommentCount: 20 })
      ]
    });

    expect(stats.windows).toHaveLength(1);
    expect(stats.windows[0].liveCount).toBe(1);
    expect(stats.windows[0].comments).toBe(5);
  });
});

describe('buildMediaKitSupporters(応援者が主役)', () => {
  it('ギフトTOPを累計pt順に集計する(匿名uidもそのまま主役)', () => {
    const out = buildMediaKitSupporters({
      liveIds: ['lv1', 'lv2'],
      giftEventsByLive: {
        lv1: [
          { userId: '100', nickname: 'たろう', point: 500 },
          { userId: 'a:XYZ', nickname: '', point: 300 }
        ],
        lv2: [{ userId: '100', nickname: 'たろう', point: 200 }]
      }
    });
    expect(out.giftTop[0]).toEqual({ userId: '100', name: 'たろう', points: 700, count: 2 });
    expect(out.giftTop[1].userId).toBe('a:XYZ');
    expect(out.giftTop[1].name).toBe('');
  });
  it('汎用名「匿名」は個人名にせず profileMap で補完する', () => {
    const out = buildMediaKitSupporters({
      liveIds: ['lv1'],
      giftEventsByLive: { lv1: [{ userId: '5', nickname: '匿名', point: 10 }] },
      profileMap: { '5': { nickname: '柿ピー' } }
    });
    expect(out.giftTop[0].name).toBe('柿ピー');
  });
  it('コメントTOPと常連(2配信以上)を直近サンプルから集計する', () => {
    const out = buildMediaKitSupporters({
      commentRowsByLive: {
        lv1: [
          { userId: 'a:1', nickname: '' },
          { userId: 'a:1', nickname: '' },
          { userId: 'a:2', nickname: '' }
        ],
        lv2: [{ userId: 'a:1', nickname: '' }]
      }
    });
    expect(out.commentTop[0]).toEqual({ userId: 'a:1', name: '', count: 3, liveCount: 2 });
    expect(out.regulars).toEqual({ sampledLives: 2, supporters: 2, regulars: 1, ratio: 0.5 });
  });
  it('データ無しでも安全な空形を返す', () => {
    const out = buildMediaKitSupporters({});
    expect(out.giftTop).toEqual([]);
    expect(out.commentTop).toEqual([]);
    expect(out.regulars.supporters).toBe(0);
    expect(out.regulars.ratio).toBe(null);
  });
});
