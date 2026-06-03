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
