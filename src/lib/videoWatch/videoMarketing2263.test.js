import { expect, it } from 'vitest';
import { videoCommentRowsForStore } from './videoCommentRows.js';
import { exportCommentsFromStoredRows } from '../youtube/exportStoredComments.js';
import { aggregateMarketingReport } from '../marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../marketingChartsHtml.js';
it('何年にもわたる動画のコメントでも、マーケHTMLが「Maximum call stack size exceeded」にならない', async () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  const comments = Array.from({ length: 40 }, (_, i) => ({ commentId: 'c' + i, text: 't' + i, name: 'n' + (i % 7), channelId: 'UC' + (i % 7), postedAtMs: now - i * 86400000 * 30 }));
  const rows = videoCommentRowsForStore(comments, { videoId: 'abc', platform: 'youtube', nowMs: now });
  const ex = await exportCommentsFromStoredRows(rows, 'lv900000000001', () => {});
  const r = aggregateMarketingReport(ex, 'lv900000000001', {});
  const html = buildMarketingDashboardHtml(r, { platform: 'youtube' });
  expect(r.timeline.length).toBe(0);
  expect(r.totalComments ?? ex.length).toBeGreaterThan(0);
  expect(html.length).toBeGreaterThan(1000);
});
