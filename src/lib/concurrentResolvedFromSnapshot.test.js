import { describe, it, expect } from 'vitest';
import {
  deriveCommentsPerMinFromSnapshot,
  resolveConcurrentFromSnapshot
} from './concurrentResolvedFromSnapshot.js';

describe('deriveCommentsPerMinFromSnapshot', () => {
  it('delta と窓から コメ/分 を出す', () => {
    expect(
      deriveCommentsPerMinFromSnapshot({
        officialStatisticsCommentsDelta: 30,
        officialCommentSampleWindowMs: 60000
      })
    ).toBe(30);
  });

  it('材料が無ければ undefined', () => {
    expect(deriveCommentsPerMinFromSnapshot({})).toBeUndefined();
    expect(deriveCommentsPerMinFromSnapshot(null)).toBeUndefined();
    expect(
      deriveCommentsPerMinFromSnapshot({
        officialStatisticsCommentsDelta: 0,
        officialCommentSampleWindowMs: 60000
      })
    ).toBeUndefined();
  });
});

describe('resolveConcurrentFromSnapshot', () => {
  it('コメンター法 fallback で推定値が出る（公式同接なし）', () => {
    const resolved = resolveConcurrentFromSnapshot(
      {
        viewerCountFromDom: 7000,
        recentActiveUsers: 40,
        streamAgeMin: 58
      },
      1_700_000_000_000
    );
    expect(resolved).toBeTruthy();
    expect(resolved.estimated).toBeGreaterThan(0);
    expect(resolved.base).toBeTruthy();
    // 研究中シグナルが base に乗っている
    expect(resolved.base).toHaveProperty('signalA');
  });

  it('空 snapshot でも throw せず安全に返る', () => {
    const resolved = resolveConcurrentFromSnapshot({}, 1_700_000_000_000);
    expect(resolved).toBeTruthy();
    expect(typeof resolved.estimated).toBe('number');
  });

  it('新鮮な公式同接があれば official 採用', () => {
    const now = 1_700_000_000_000;
    const resolved = resolveConcurrentFromSnapshot(
      {
        officialViewerCount: 1234,
        officialStatsUpdatedAt: now - 1000,
        officialViewerIntervalMs: 30000,
        recentActiveUsers: 10,
        streamAgeMin: 20
      },
      now
    );
    expect(resolved.method).toBe('official');
    expect(resolved.estimated).toBe(1234);
  });
});
