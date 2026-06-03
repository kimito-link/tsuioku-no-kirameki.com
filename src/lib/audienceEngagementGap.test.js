import { describe, it, expect } from 'vitest';
import { analyzeAudienceEngagementGap } from './audienceEngagementGap.js';

const t = Date.parse('2026-05-29T12:00:00.000Z');

describe('analyzeAudienceEngagementGap', () => {
  it('来場が多くコメントが少ない状態を silent-crowd と判定する', () => {
    const comments = Array.from({ length: 60 }, (_, i) => ({
      liveId: 'lv1',
      text: `c${i}`,
      userId: String(1000 + (i % 12)),
      capturedAt: t + i
    }));
    const out = analyzeAudienceEngagementGap({
      liveId: 'lv1',
      visitorCount: 1200,
      officialCommentCount: 60,
      comments
    });

    expect(out.level).toBe('silent-crowd');
    expect(out.commentsPer100Visitors).toBe(5);
    expect(out.uniqueCommentersPer100Visitors).toBe(1);
    expect(out.commentParticipationPct).toBe(1);
    expect(out.silentVisitorEstimate).toBe(1188);
    expect(out.insightLines.join('\n')).toContain('静かな観客');
  });

  it('来場に対してコメント反応が十分なら healthy', () => {
    const comments = Array.from({ length: 160 }, (_, i) => ({
      liveId: 'lv1',
      text: `c${i}`,
      userId: String(1000 + (i % 80)),
      capturedAt: t + i
    }));
    const out = analyzeAudienceEngagementGap({
      liveId: 'lv1',
      snapshot: { viewerCountFromDom: 200, officialCommentCount: 180 },
      comments
    });

    expect(out.level).toBe('healthy');
    expect(out.commentsPer100Visitors).toBe(90);
    expect(out.uniqueCommentersPer100Visitors).toBe(40);
  });

  it('時系列サンプルから来場増・コメント伸び悩み区間を返す', () => {
    const out = analyzeAudienceEngagementGap({
      liveId: 'lv1',
      samples: [
        { liveId: 'lv1', capturedAt: t, viewerCountFromDom: 100, officialCommentCount: 20 },
        { liveId: 'lv1', capturedAt: t + 60_000, viewerCountFromDom: 500, officialCommentCount: 25 },
        { liveId: 'lv1', capturedAt: t + 120_000, viewerCountFromDom: 560, officialCommentCount: 70 }
      ]
    });

    expect(out.totalVisitors).toBe(560);
    expect(out.officialCommentCount).toBe(70);
    expect(out.quietAudienceWindows).toEqual([
      {
        startAt: t,
        endAt: t + 60_000,
        visitorDelta: 400,
        commentDelta: 5,
        commentsPer100NewVisitors: 1.25
      }
    ]);
  });

  it('配信者本人と別 liveId のコメントを除外して recorded を計算する', () => {
    const out = analyzeAudienceEngagementGap(
      {
        liveId: 'lv1',
        visitorCount: 100,
        comments: [
          { liveId: 'lv1', text: 'viewer', userId: '111' },
          { liveId: 'lv1', text: 'caster', userId: '999' },
          { liveId: 'lv2', text: 'other', userId: '222' }
        ]
      },
      { broadcasterUserId: '999' }
    );

    expect(out.recordedCommentCount).toBe(1);
    expect(out.uniqueCommenters).toBe(1);
    expect(out.recordedCommentsPer100Visitors).toBe(1);
  });
});
