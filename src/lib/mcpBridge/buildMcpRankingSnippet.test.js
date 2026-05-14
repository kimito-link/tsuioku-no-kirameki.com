import { describe, it, expect } from 'vitest';
import { buildMcpRankingSnippetFromBundle } from './buildMcpRankingSnippet.js';

describe('buildMcpRankingSnippetFromBundle', () => {
  it('null / 非オブジェクトは null', () => {
    expect(buildMcpRankingSnippetFromBundle(null)).toBe(null);
    expect(buildMcpRankingSnippetFromBundle(undefined)).toBe(null);
    expect(buildMcpRankingSnippetFromBundle('x')).toBe(null);
  });

  it('ランキング配列が無ければ null', () => {
    expect(buildMcpRankingSnippetFromBundle({ capturedAt: 1 })).toBe(null);
    expect(
      buildMcpRankingSnippetFromBundle({
        capturedAt: 1,
        contributionRanking: [],
        adContributionRanking: []
      })
    ).toBe(null);
  });

  it('貢献度のみ: 名前は出さず rank/contribution/isAnonymous のみ', () => {
    const sn = buildMcpRankingSnippetFromBundle({
      capturedAt: 1_700_000_000_000,
      contributionRanking: [
        { rank: 1, contribution: 100, isAnonymous: false, name: '秘密の名前' },
        { rank: 2, contribution: 50, isAnonymous: true, name: 'X' }
      ]
    });
    expect(sn).not.toBe(null);
    expect(sn?.bundleCapturedAt).toBe(1_700_000_000_000);
    expect(sn?.contribution.rowCount).toBe(2);
    expect(sn?.contribution.rows).toHaveLength(2);
    expect(sn?.contribution.rows[0]).toEqual({
      rank: 1,
      contribution: 100,
      isAnonymous: false
    });
    expect(JSON.stringify(sn)).not.toMatch(/秘密/);
    expect(sn?.ad.rowCount).toBe(0);
    expect(sn?.ad.rows).toEqual([]);
  });

  it('maxRows で切り詰め truncated が true', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      rank: i + 1,
      contribution: (i + 1) * 10,
      isAnonymous: false
    }));
    const sn = buildMcpRankingSnippetFromBundle(
      { capturedAt: 100, contributionRanking: rows },
      { maxRows: 3 }
    );
    expect(sn?.contribution.truncated).toBe(true);
    expect(sn?.contribution.rows).toHaveLength(3);
    expect(sn?.contribution.rowCount).toBe(12);
  });

  it('広告ランキング側も同時に入る', () => {
    const sn = buildMcpRankingSnippetFromBundle({
      capturedAt: 5,
      contributionRanking: [{ rank: 1, contribution: 1, isAnonymous: false }],
      adContributionRanking: [{ rank: 1, contribution: 999, isAnonymous: true }]
    });
    expect(sn?.contribution.rows[0]?.contribution).toBe(1);
    expect(sn?.ad.rows[0]?.contribution).toBe(999);
    expect(sn?.ad.rowCount).toBe(1);
  });
});
