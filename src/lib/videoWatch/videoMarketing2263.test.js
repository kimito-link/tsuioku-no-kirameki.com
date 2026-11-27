/**
 * v0.1.2263 契約: YouTube 動画のマーケHTML。何年にもわたるコメントでも、
 *   「Maximum call stack size exceeded」「Invalid string length」(メモリ切れ)にならない。
 *   時間の流れの幅は marketingTimeSpan.js の1か所で決める。ライブ(7日以内)は今までと同じ配列のまま。
 */
import { describe, expect, it } from 'vitest';
import { videoCommentRowsForStore, VIDEO_ROWS_CAP } from './videoCommentRows.js';
import { exportCommentsFromStoredRows } from '../youtube/exportStoredComments.js';
import { aggregateMarketingReport } from '../marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../marketingChartsHtml.js';
import { boundCommentsToTimeWindow, MARKETING_TIMELINE_MAX_MINUTES } from '../marketingTimeSpan.js';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const YEAR = 365 * 86_400_000;

async function videoExport(n, spanMs) {
  const comments = Array.from({ length: n }, (_, i) => ({
    commentId: 'c' + i,
    text: 'コメント' + i,
    name: 'n' + (i % 37),
    channelId: 'UC' + String(i % 37).padStart(22, 'x'),
    postedAtMs: NOW - Math.floor(((i / n) ** 2) * spanMs),
  }));
  const rows = videoCommentRowsForStore(comments, { videoId: 'kKl0E22tU78', platform: 'youtube', nowMs: NOW });
  return { rows, ex: await exportCommentsFromStoredRows(rows, 'lv900000000001', () => {}) };
}

describe('YouTube 動画のマーケHTML(何年にもわたるコメント)', () => {
  it('15年にわたる200件(動画の上限)でも、集計と HTML が落ちず、大きさに上限がある', async () => {
    const { rows, ex } = await videoExport(VIDEO_ROWS_CAP, 15 * YEAR);
    expect(ex.length).toBe(VIDEO_ROWS_CAP);
    const r = aggregateMarketingReport(ex, 'lv900000000001', {});
    expect(r.timeline.length).toBe(0);
    const html = buildMarketingDashboardHtml(r, {
      platform: 'youtube',
      commentsForAnalytics: ex,
      recordedCommentCount: ex.length,
      programStartAtMs: rows[0].recordedAt,
      pageCount: 123456,
    });
    expect(html.length).toBeGreaterThan(1000);
    expect(html.length).toBeLessThan(20_000_000);
    expect(html).toContain('時間の流れはコメントの新しい側7日分');
  }, 60_000);

  it('時間の幅は1か所で決める: 7日以内は同じ配列のまま(ライブは変わらない)、超えると新しい側7日だけ', () => {
    const live = Array.from({ length: 50 }, (_, i) => ({ capturedAt: NOW - i * 60_000 }));
    const a = boundCommentsToTimeWindow(live);
    expect(a.windowed).toBe(false);
    expect(a.comments).toBe(live);
    const long = [{ capturedAt: NOW }, { capturedAt: NOW - 3 * 86_400_000 }, { capturedAt: NOW - 30 * 86_400_000 }, { capturedAt: 0 }];
    const b = boundCommentsToTimeWindow(long);
    expect(b.windowed).toBe(true);
    expect(b.comments.map((c) => c.capturedAt)).toEqual([NOW, NOW - 3 * 86_400_000, 0]);
    expect(MARKETING_TIMELINE_MAX_MINUTES).toBe(7 * 24 * 60);
  });
});
