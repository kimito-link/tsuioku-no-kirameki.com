import { describe, it, expect } from 'vitest';
import { buildNorthStarAdRankingStatsHtml } from './buildNorthStarAdRankingStatsHtml.js';

describe('buildNorthStarAdRankingStatsHtml', () => {
  it('番組統計・貢合計・件数を返す', () => {
    const html = buildNorthStarAdRankingStatsHtml({
      programAdPts: 600,
      rankingContributionSum: 1200,
      rankingRowCount: 1
    });
    expect(html).toContain('nl-north-star-ad-stats');
    expect(html).toContain('600');
    expect(html).toContain('1,200');
    expect(html).toContain('（1件）');
  });

  it('行数ゼロなら空', () => {
    expect(
      buildNorthStarAdRankingStatsHtml({
        programAdPts: 600,
        rankingContributionSum: 1200,
        rankingRowCount: 0
      })
    ).toBe('');
  });
});
