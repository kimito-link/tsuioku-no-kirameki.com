import { describe, expect, it } from 'vitest';
import { buildHtmlReportCommenterFollowBlock } from './htmlReportCommenterFollowSection.js';

/** @returns {import('./marketingAggregate.js').MarketingReport} */
function sampleReport() {
  return {
    liveId: 'lv123456789',
    topUsers: [],
    allNumericCommenters: [
      {
        userId: '111',
        nickname: 'alpha',
        count: 12,
        followerCount: 500,
        followeeCount: 40,
        userLevel: 10,
        isPremium: true
      },
      {
        userId: '222',
        nickname: 'beta',
        count: 3,
        followerCount: 20,
        followeeCount: 80,
        userLevel: 5,
        isPremium: false
      }
    ],
    commenterFollowDataset: {
      liveId: 'lv123456789',
      withFollowData: 2,
      totalNumericCommenters: 2,
      rows: []
    }
  };
}

describe('buildHtmlReportCommenterFollowBlock', () => {
  it('数値 ID コメンターがいれば一覧・分析・埋め込み JSON を返す', () => {
    const block = buildHtmlReportCommenterFollowBlock({
      report: sampleReport(),
      exportedAt: '2026-06-02T00:00:00.000Z'
    });
    expect(block.hasAny).toBe(true);
    expect(block.hasDirectory).toBe(true);
    expect(block.hasAnalytics).toBe(true);
    expect(block.directoryHtml).toContain('id="sec-commenter-follow"');
    expect(block.analyticsHtml).toContain('id="sec-commenter-follow-analytics"');
    expect(block.analyticsHtml).toContain('html-commenter-follow-csv');
    expect(block.embedScriptHtml).toContain('id="nl-marketing-export-v1"');
    expect(block.embedScriptHtml).toContain('"allNumericCommenters"');
    expect(block.css).toContain('.mkt-cfa-segments');
  });

  it('数値 ID コメンターが空なら空文字', () => {
    const block = buildHtmlReportCommenterFollowBlock({
      report: { liveId: 'lv1', topUsers: [], allNumericCommenters: [] }
    });
    expect(block.hasAny).toBe(false);
    expect(block.directoryHtml).toBe('');
    expect(block.analyticsHtml).toBe('');
    expect(block.embedScriptHtml).toBe('');
  });
});
