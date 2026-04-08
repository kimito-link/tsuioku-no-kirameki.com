import { describe, it, expect } from 'vitest';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';

/** @returns {import('./marketingAggregate.js').MarketingReport} */
function minimal() {
  return {
    liveId: 'lv123',
    totalComments: 50,
    uniqueUsers: 10,
    avgCommentsPerUser: 5,
    medianCommentsPerUser: 3,
    peakMinute: 5,
    peakMinuteCount: 12,
    durationMinutes: 30,
    commentsPerMinute: 1.7,
    topUsers: [
      { userId: 'u1', nickname: 'Alice', avatarUrl: '', count: 15, firstAt: 0, lastAt: 1 },
      { userId: 'u2', nickname: '', avatarUrl: 'https://example.com/av.jpg', count: 8, firstAt: 0, lastAt: 1 }
    ],
    timeline: Array.from({ length: 30 }, (_, i) => ({
      minute: i,
      count: i === 5 ? 12 : 2,
      uniqueUsers: i === 5 ? 8 : 1
    })),
    segmentCounts: { heavy: 2, mid: 3, light: 2, once: 3 },
    segmentPcts: { heavy: 20, mid: 30, light: 20, once: 30 },
    hourDistribution: new Array(24).fill(0).map((_, i) => (i >= 20 && i <= 23 ? 10 : 1))
  };
}

describe('buildMarketingDashboardHtml', () => {
  it('完全な HTML ドキュメントを返す', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lv123');
  });

  it('KPI セクションが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('KPI サマリ');
    expect(html).toContain('50');
  });

  it('タイムラインの SVG が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('コメントタイムライン');
    expect(html).toContain('<svg');
    expect(html).toContain('<polyline');
  });

  it('セグメント円グラフが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('ユーザーセグメント');
    expect(html).toContain('ヘビー');
  });

  it('トップコメンターが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('トップコメンター');
    expect(html).toContain('Alice');
  });

  it('時間帯ヒートマップが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('時間帯ヒートマップ');
    expect(html).toContain('mkt-hour');
  });

  it('XSS: liveId にタグが入ってもエスケープされる', () => {
    const r = minimal();
    r.liveId = '<script>alert(1)</script>';
    const html = buildMarketingDashboardHtml(r);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('りんく・こん太・たぬ姉の案内ブロックが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('りんく・こん太・たぬ姉から');
    expect(html).toContain('mkt-advice--tanu');
    expect(html).toContain('mkt-advice--rink');
    expect(html).toContain('mkt-advice--konta');
    expect(html).toContain('mkt-advice-row');
    expect(html).toContain('mkt-advice__bubble');
    expect(html).toContain('mkt-advice__avatar');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('追憶のきらめき');
  });

  it('冒頭案内にりんく・こん太・たぬ姉の吹き出しが各1つずつ', () => {
    const html = buildMarketingDashboardHtml(minimal());
    const start = html.indexOf('mkt-advice-stack--intro');
    expect(start).toBeGreaterThan(-1);
    const end = html.indexOf('<h2>KPI サマリ</h2>', start);
    expect(end).toBeGreaterThan(start);
    const introBlock = html.slice(start, end);
    expect((introBlock.match(/mkt-advice-row mkt-advice--rink/g) || []).length).toBe(1);
    expect((introBlock.match(/mkt-advice-row mkt-advice--konta/g) || []).length).toBe(1);
    expect((introBlock.match(/mkt-advice-row mkt-advice--tanu/g) || []).length).toBe(1);
  });

  it('機能一覧とスタイル否定しない文言・分析メモの案内が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('このページでできること');
    expect(html).toContain('mkt-section--features');
    expect(html).toContain('分析メモ');
    expect(html).toContain('どんな配信も否定しません');
    expect(html).toContain('縛られる必要もありません');
  });

  it('maskShareLabels でトップコメンター名が伏せ字になり example.com のサムネURLが出ない', () => {
    const html = buildMarketingDashboardHtml(minimal(), { maskShareLabels: true });
    expect(html).toContain('共有向けに表示名を伏せた出力');
    expect(html).not.toContain('Alice');
    expect(html).toContain('A•••');
    expect(html).not.toContain('example.com');
  });
});
