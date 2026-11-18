import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aggregateMarketingReport } from '../marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../marketingChartsHtml.js';

describe('Twitch の書き出し', () => {
  it('数千件のコメントとフォロワー標本でも、報告は時間内にできる', () => {
    const t0 = Date.parse('2026-11-18T04:50:00Z');
    const comments = [];
    for (let i = 0; i < 4000; i += 1) {
      const at = t0 + i * 180;
      if (i % 40 === 0) {
        comments.push({
          id: `b${i}`,
          liveId: 'lv900000000001',
          text: 'cheer',
          userId: `u${i % 50}`,
          nickname: `user${i}`,
          capturedAt: at,
          ytKind: 'superchat',
          ytPlatform: 'twitch',
          ytCurrency: 'BITS',
          ytAmount: 100 + (i % 500),
        });
      } else {
        comments.push({
          id: `c${i}`,
          liveId: 'lv900000000001',
          text: `がんばれ${i}`,
          userId: `u${i % 200}`,
          nickname: `fan${i}`,
          capturedAt: at,
          ytKind: 'text',
          ytPlatform: 'twitch',
        });
      }
    }
    const followerSamples = [];
    for (let i = 0; i < 12; i += 1) {
      followerSamples.push({
        at: t0 + i * 180_000,
        count: 1200 + i * 3,
        rounded: false,
        source: 'page-count',
        noun: 'フォロワー',
      });
    }
    const started = performance.now();
    const report = aggregateMarketingReport(comments, 'lv900000000001');
    const html = buildMarketingDashboardHtml(report, {
      platform: 'twitch',
      commentsForAnalytics: comments,
      followerSamples,
      programStartAtMs: t0,
    });
    const ms = performance.now() - started;
    expect(html).toContain('id="mkt-support-arrival"');
    expect(html).toContain('フォロワー');
    expect(html).toContain('1,200人');
    expect(ms).toBeLessThan(3000);
  });

  it('人数の読み取りは書き出しの通信にも、配信要約の全件読みにも乗らない', () => {
    const src = readFileSync(new URL('../../extension/marketing-export-entry.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('async function followerSamplesForExport'), src.indexOf('async function runExport'));
    expect(fn).toContain('withTimeout');
    expect(fn).not.toContain(', 800,');
    expect(fn).not.toContain('yt_stream_summaries');
    expect(fn).not.toContain('fetch(');
    const block = src.slice(src.indexOf('let commentsRaw'), src.indexOf('gift_storage_timeout'));
    expect(block).toContain('readStoredExportComments');
    expect(block).toContain('marketing_storage_timeout');
    expect(block).not.toContain('followerSamplesForExport');
    expect(src).toContain('gift_storage_timeout');
  });
});
