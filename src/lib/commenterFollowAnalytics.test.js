import { describe, it, expect } from 'vitest';
import {
  COMMENTER_FOLLOW_CSV_BOM,
  analyzeCommenterBroadcasterFollow,
  analyzeCommenterFollowDeltas,
  analyzeCommenterFollowTimingByCommentWindow,
  analyzeCommenterFolloweeProfile,
  analyzeCommonFolloweesAmongCommenters,
  buildCommenterFollowAnalytics,
  buildCommenterFollowCsv,
  buildCommenterFollowCsvRows,
  buildCommenterFollowCsvText,
  buildCommenterFollowScatterPoints,
  buildCommenterFollowSegments,
  computeCommenterFollowThresholds,
  computePercentile,
  normalizeCommenterFollowAnalyticsRows
} from './commenterFollowAnalytics.js';

const USERS = [
  {
    userId: '1',
    nickname: '高常連',
    count: 10,
    followerCount: 200,
    followeeCount: 30,
    userLevel: 20,
    isPremium: true,
    firstAt: 100,
    lastAt: 200
  },
  {
    userId: '2',
    nickname: 'ローカル',
    count: 10,
    followerCount: 5,
    followeeCount: 1,
    userLevel: 5,
    isPremium: false
  },
  {
    userId: '3',
    nickname: '静か',
    count: 2,
    followerCount: 100,
    followeeCount: 8
  },
  {
    userId: '4',
    nickname: '通常',
    count: 1,
    followerCount: 20
  },
  {
    userId: '5',
    nickname: '未取得',
    count: 7
  }
];

describe('commenterFollowAnalytics', () => {
  it('percentile と中央値しきい値を計算する', () => {
    expect(computePercentile([1, 2, 3, 4], 75)).toBe(3.25);

    const thresholds = computeCommenterFollowThresholds(USERS, { highPercentile: 50 });
    expect(thresholds.sampleSize).toBe(4);
    expect(thresholds.followerCount.median).toBe(60);
    expect(thresholds.followerCount.threshold).toBe(60);
    expect(thresholds.commentCount.median).toBe(6);
    expect(thresholds.commentCount.threshold).toBe(6);
  });

  it('commenterFollowDataset.rows を allNumericCommenters にマージする', () => {
    const rows = normalizeCommenterFollowAnalyticsRows(
      [
        { userId: '10', nickname: 'Comma, "Name"', count: 3 },
        { userId: '11', nickname: 'NoFollow', count: 1 }
      ],
      {
        commenterFollowDataset: {
          rows: [
            {
              userId: '10',
              commentCount: 3,
              followerCount: 50,
              followeeCount: 12,
              level: 7,
              isPremium: true,
              followFetchedAt: 999
            }
          ]
        }
      }
    );

    expect(rows[0]).toMatchObject({
      userId: '10',
      commentCount: 3,
      followerCount: 50,
      followeeCount: 12,
      userLevel: 7,
      isPremium: true,
      followFetchedAt: 999
    });
  });

  it('散布図点に followerCount x commentCount y とセグメントIDを載せる', () => {
    const points = buildCommenterFollowScatterPoints(USERS, { highPercentile: 50 });
    const byId = new Map(points.map((p) => [p.userId, p]));
    expect(byId.get('1')).toMatchObject({
      followerCount: 200,
      commentCount: 10,
      segmentId: 'highFollowerRegulars'
    });
    expect(byId.get('2')?.segmentId).toBe('localEnthusiasts');
    expect(byId.get('3')?.segmentId).toBe('quietSupporters');
    expect(byId.has('5')).toBe(false);
  });

  it('自動セグメントをしきい値ベースで作る', () => {
    const segments = buildCommenterFollowSegments(USERS, { highPercentile: 50 });
    expect(segments.highFollowerRegulars.rows.map((r) => r.userId)).toEqual(['1']);
    expect(segments.localEnthusiasts.rows.map((r) => r.userId)).toEqual(['2']);
    expect(segments.quietSupporters.rows.map((r) => r.userId)).toEqual(['3']);
    expect(segments.highFollowerRegulars.summary).toContain('高フォロワー常連は1名');
    expect(segments.highFollowerRegulars.representatives.map((r) => r.userId)).toEqual(['1']);
  });

  it('CSV 行と UTF-8 BOM 付きCSVを組み立てる', () => {
    const rows = buildCommenterFollowCsvRows(
      [{ userId: '10', nickname: 'Comma, "Name"', count: 3, avatarUrl: 'https://example.test/a.png' }],
      {
        commenterFollowDataset: {
          rows: [{ userId: '10', commentCount: 3, followerCount: 50, level: 7 }]
        }
      }
    );
    expect(rows[0]).toMatchObject({
      userId: '10',
      nickname: 'Comma, "Name"',
      commentCount: 3,
      followerCount: 50,
      userLevel: 7
    });

    const csv = buildCommenterFollowCsvText(
      [{ userId: '10', nickname: 'Comma, "Name"', count: 3 }],
      {
        commenterFollowDataset: {
          rows: [{ userId: '10', commentCount: 3, followerCount: 50 }]
        }
      }
    );
    expect(csv.startsWith(COMMENTER_FOLLOW_CSV_BOM)).toBe(true);
    expect(csv).toContain('userId,nickname,commentCount,followerCount');
    expect(csv).toContain('"Comma, ""Name"""');

    const publicApiCsv = buildCommenterFollowCsv([{ userId: '11', nickname: '公開API', count: 1 }]);
    expect(publicApiCsv.startsWith(COMMENTER_FOLLOW_CSV_BOM)).toBe(true);
    expect(publicApiCsv).toContain('公開API');
  });

  it('まとめ関数で行・しきい値・点・セグメントを同時に返す', () => {
    const analytics = buildCommenterFollowAnalytics(USERS, { highPercentile: 50 });
    expect(analytics.rows).toHaveLength(5);
    expect(analytics.rowsWithFollowerCount).toHaveLength(4);
    expect(analytics.scatterPoints).toHaveLength(4);
    expect(analytics.segments.quietSupporters.count).toBe(1);
    expect(analytics.followeeProfile.sampleSize).toBe(3);
    expect(analytics.followTiming.buckets).toHaveLength(4);
    expect(analytics.broadcasterFollow).toBeDefined();
    expect(analytics.commonFollowees).toBeDefined();
  });

  it('前回キャッシュと比較してフォロワー増減を出す', () => {
    const rows = normalizeCommenterFollowAnalyticsRows(USERS);
    const deltas = analyzeCommenterFollowDeltas(rows, {
      '1': { followerCount: 180, followeeCount: 25, fetchedAt: 1000 },
      '3': { followerCount: 120, followeeCount: 8, fetchedAt: 1000 }
    });
    expect(deltas.comparedCount).toBe(2);
    expect(deltas.increased.some((r) => r.userId === '1' && r.followerDelta === 20)).toBe(true);
    expect(deltas.decreased.some((r) => r.userId === '3' && r.followerDelta === -20)).toBe(true);
  });

  it('followee 分布と初コメ時刻帯別増減を出す', () => {
    const rows = normalizeCommenterFollowAnalyticsRows(USERS);
    const profile = analyzeCommenterFolloweeProfile(rows);
    expect(profile.medianFolloweeCount).toBeGreaterThan(0);
    expect(profile.followeeBuckets.some((b) => b.count > 0)).toBe(true);

    const deltas = analyzeCommenterFollowDeltas(rows, {
      '1': { followerCount: 180, followeeCount: 25, fetchedAt: 1000 }
    });
    const timing = analyzeCommenterFollowTimingByCommentWindow(rows, deltas, { durationMs: 400 });
    expect(timing.buckets[0].commenterCount).toBe(1);
  });

  it('配信者フォロー率と共通フォロー先を集計する', () => {
    const rows = normalizeCommenterFollowAnalyticsRows(USERS);
    const listMap = {
      '1': { userIds: ['7', '99'], status: 'ok', fetchedAt: 1, truncated: false, pageCount: 1 },
      '2': { userIds: ['7'], status: 'ok', fetchedAt: 1, truncated: false, pageCount: 1 }
    };
    const bf = analyzeCommenterBroadcasterFollow(rows, listMap, '7');
    expect(bf.sampleSize).toBe(2);
    expect(bf.followedCount).toBe(2);
    expect(bf.pct).toBe(100);
    const common = analyzeCommonFolloweesAmongCommenters(listMap);
    expect(common[0]).toMatchObject({ userId: '7', overlapCount: 2 });
  });
});

/* -------------------------------------------------------------------------- */
/* v0.1.610 Phase 2-B: includeSupporterPower opt-in 接続テスト                  */
/* -------------------------------------------------------------------------- */

describe('buildCommenterFollowAnalytics + supporterPower (Phase 2-B)', () => {
  it('opt-in 無し(または false)は既存 fields のみで supporterPower 系は出ない(後方互換)', () => {
    const a1 = buildCommenterFollowAnalytics(USERS);
    expect(a1.rows.length).toBeGreaterThan(0);
    expect(a1.supporterPowerRows).toBeUndefined();
    expect(a1.supporterPowerSummary).toBeUndefined();

    const a2 = buildCommenterFollowAnalytics(USERS, { includeSupporterPower: false });
    expect(a2.supporterPowerRows).toBeUndefined();
    expect(a2.supporterPowerSummary).toBeUndefined();
  });

  it('includeSupporterPower=true で supporterPowerRows と summary が追加される', () => {
    const a = buildCommenterFollowAnalytics(USERS, {
      includeSupporterPower: true
    });
    expect(Array.isArray(a.supporterPowerRows)).toBe(true);
    expect(a.supporterPowerRows.length).toBe(a.rows.length);
    for (const r of a.supporterPowerRows) {
      expect(typeof r.power.score).toBe('number');
      expect(r.power.score).toBeGreaterThanOrEqual(0);
      expect(r.power.score).toBeLessThanOrEqual(100);
      expect(['S', 'A', 'B', 'C', 'D', 'E']).toContain(r.power.tier);
      expect(typeof r.power.percentile).toBe('number');
      expect(typeof r.power.components.engagement).toBe('number');
      expect(typeof r.power.components.loyalty).toBe('number');
      expect(typeof r.power.components.influence).toBe('number');
      expect(['highFollowerRegulars', 'localEnthusiasts', 'quietSupporters', 'other'])
        .toContain(r.segmentId);
    }
    expect(typeof a.supporterPowerSummary.sampleSize).toBe('number');
    expect(typeof a.supporterPowerSummary.medianScore).toBe('number');
    expect(a.supporterPowerSummary.topRows.length).toBeGreaterThan(0);
    expect(a.supporterPowerSummary.topRows.length).toBeLessThanOrEqual(10);
    // tierCounts の合計は sampleSize と一致
    const total = Object.values(a.supporterPowerSummary.tierCounts).reduce(
      (s, n) => s + n, 0
    );
    expect(total).toBe(a.supporterPowerSummary.sampleSize);
  });

  it('既存 fields は opt-in 有無で完全に同じ(完全互換)', () => {
    const a1 = buildCommenterFollowAnalytics(USERS);
    const a2 = buildCommenterFollowAnalytics(USERS, { includeSupporterPower: true });
    // 既存 fields の deep equal
    expect(a2.rows).toEqual(a1.rows);
    expect(a2.rowsWithFollowerCount).toEqual(a1.rowsWithFollowerCount);
    expect(a2.thresholds).toEqual(a1.thresholds);
    expect(a2.scatterPoints).toEqual(a1.scatterPoints);
    expect(a2.segments).toEqual(a1.segments);
    expect(a2.followDeltas).toEqual(a1.followDeltas);
    expect(a2.followeeProfile).toEqual(a1.followeeProfile);
    expect(a2.followTiming).toEqual(a1.followTiming);
    expect(a2.broadcasterFollow).toEqual(a1.broadcasterFollow);
    expect(a2.commonFollowees).toEqual(a1.commonFollowees);
    expect(a2.followingListInsights).toEqual(a1.followingListInsights);
  });

  it('giftTotalsByUserId と loyaltyCountsByUserId を opts で渡せる', () => {
    const a = buildCommenterFollowAnalytics(USERS, {
      includeSupporterPower: true,
      giftTotalsByUserId: { '1': 1000, '2': 500 },
      loyaltyCountsByUserId: { '1': 20, '2': 5 },
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    const r1 = a.supporterPowerRows.find((r) => r.userId === '1');
    const r2 = a.supporterPowerRows.find((r) => r.userId === '2');
    expect(r1.giftTotalPoints).toBe(1000);
    expect(r2.giftTotalPoints).toBe(500);
    expect(r1.loyaltyCount).toBe(20);
    expect(r2.loyaltyCount).toBe(5);
    // gift・loyalty が高い r1 のスコアは r2 より高いはず
    expect(r1.power.score).toBeGreaterThan(r2.power.score);
  });

  it('空入力でも supporterPowerRows は安全に未定義', () => {
    const a = buildCommenterFollowAnalytics([], { includeSupporterPower: true });
    // 空 rows なので supporterPower 計算もスキップされ undefined
    expect(a.supporterPowerRows).toBeUndefined();
    expect(a.supporterPowerSummary).toBeUndefined();
  });

  it('supporterPowerTopN で topRows の件数を制限できる', () => {
    const a = buildCommenterFollowAnalytics(USERS, {
      includeSupporterPower: true,
      supporterPowerTopN: 1
    });
    expect(a.supporterPowerSummary.topRows.length).toBeLessThanOrEqual(1);
  });
});
