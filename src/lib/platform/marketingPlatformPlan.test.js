import { describe, expect, it } from 'vitest';
import { aggregateMarketingReport, isMarketingSupportRow, speechCommentsForMarketing } from '../marketingAggregate.js';
import { marketingViewFor } from './marketingPlatformPlan.js';
import { platformCapability } from './platformMetrics.js';

describe('marketingViewFor', () => {
  it('ニコ生と未指定は null', () => {
    expect(marketingViewFor(undefined)).toBe(null);
    expect(marketingViewFor('')).toBe(null);
    expect(marketingViewFor('niconico')).toBe(null);
  });

  it('TikTok は能力表にあり、視聴者数と書く', () => {
    expect(platformCapability('tiktok').concurrentLabel).toBe('視聴者数');
    expect(platformCapability('tiktok').visitorCard).toBe(false);
    const view = marketingViewFor('tiktok');
    expect(view?.id).toBe('tiktok');
    expect(view?.concurrentLabel).toBe('視聴者数');
    expect(view?.hide.has('mkt-ad-observed')).toBe(true);
    expect(view?.hide.has('mkt-vpos')).toBe(true);
  });

  it('ABEMA はギフトの章を出さない', () => {
    const view = marketingViewFor('abema');
    expect(view?.hideGift).toBe(true);
    expect(view?.hide.has('mkt-gift-ledger')).toBe(true);
    expect(view?.pageCountLabel).toContain('ページの数');
    expect(view?.concurrentHeading).toBe('視聴数の推移');
  });

  it('YouTube の円換算は推定と書く', () => {
    expect(marketingViewFor('youtube')?.pointColumn).toBe('円換算（推定）');
    expect(marketingViewFor('youtube')?.pointEstimate).toBe(true);
  });
});

describe('応援の行', () => {
  it('ytKind が無い行は発言のまま', () => {
    const rows = [{ text: 'a', ytKind: '' }, { text: 'b' }];
    expect(isMarketingSupportRow(rows[0])).toBe(false);
    expect(speechCommentsForMarketing(rows)).toBe(rows);
  });

  it('レイドはコメント数に入れない', () => {
    const comments = [
      { id: '1', liveId: 'lv1', text: 'hello', userId: '1', capturedAt: 1, ytKind: 'text' },
      { id: '2', liveId: 'lv1', text: 'レイド', userId: '2', capturedAt: 2, ytKind: 'tw_raid' },
    ];
    const report = aggregateMarketingReport(comments, 'lv1');
    expect(report.totalComments).toBe(1);
    expect(report.supportRows).toHaveLength(1);
    const speech = speechCommentsForMarketing(comments);
    expect(speech).toHaveLength(1);
    expect(speech[0].id).toBe('1');
  });
});
