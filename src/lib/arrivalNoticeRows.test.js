/**
 * lv351831423 のずれ: 内訳「興味来場 31」とレポート「通知 5回 / 17人」。
 * 保存済み5文面は両方で5回・17人。時刻の無い末尾の同じ文面は足さない。
 */
import { describe, it, expect } from 'vitest';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { summarizeCommentRecordBreakdown } from './commentRecordBreakdown.js';
import { normalizeTailRowsForDisplay } from './readAllCommentsForLive.js';

const LV = 'lv351831423';
const BASE = 1_700_000_000_000;
const COUNTS = [1, 2, 3, 5, 6];

function stored(n, i) {
  return {
    id: `stored-${i}`,
    liveId: LV,
    commentNo: '',
    text: `「サッカー」が好きな${n}人が来場しました`,
    userId: null,
    capturedAt: BASE + i * 60_000
  };
}

describe('来場の内訳とレポートは同じ文面を数える', () => {
  it('保存済み5回・17人に、末尾の同じ文面26件を足しても両方5回・17人', () => {
    const main = COUNTS.map((n, i) => stored(n, i));
    const tail = normalizeTailRowsForDisplay(
      Array.from({ length: 26 }, (_, i) => ({
        text: main[i % main.length].text
      })),
      LV,
      BASE + 30 * 60_000
    );
    const normal = {
      id: 'n1',
      liveId: LV,
      commentNo: '1',
      text: 'やあ',
      userId: 'u1',
      capturedAt: BASE
    };
    const rows = [normal, ...main, ...tail];
    const panel = summarizeCommentRecordBreakdown(rows);
    const report = aggregateMarketingReport(rows, LV);
    expect(tail.every((row) => row.arrivalUnstamped === true)).toBe(true);
    expect(panel.interestArrival).toBe(5);
    expect(panel.normal).toBe(1);
    expect(panel.total).toBe(1 + 5 + 26);
    expect(report.totalComments).toBe(1);
    expect(report.interestArrivalSummary.messageCount).toBe(5);
    expect(report.interestArrivalSummary.totalArrivals).toBe(17);
    expect(report.interestArrivalSummary.topTags[0]).toEqual({
      tag: 'サッカー',
      arrivals: 17,
      messageCount: 5
    });
  });

  it('末尾にしか無い文面は、内訳とレポートの両方に1回入る', () => {
    const onlyTail = normalizeTailRowsForDisplay(
      [{ text: '放送者のサポーターが1人来場しました' }, { text: '放送者のサポーターが1人来場しました' }],
      LV,
      BASE
    );
    const panel = summarizeCommentRecordBreakdown(onlyTail);
    const report = aggregateMarketingReport(onlyTail, LV);
    expect(panel.interestArrival).toBe(1);
    expect(report.interestArrivalSummary.messageCount).toBe(1);
    expect(report.interestArrivalSummary.totalArrivals).toBe(1);
    expect(report.totalComments).toBe(0);
  });

  it('保存済みの同じ文面が時刻違いで2行なら、両方2回のまま', () => {
    const rows = [stored(1, 0), stored(1, 1)];
    expect(summarizeCommentRecordBreakdown(rows).interestArrival).toBe(2);
    const report = aggregateMarketingReport(rows, LV);
    expect(report.interestArrivalSummary.messageCount).toBe(2);
    expect(report.interestArrivalSummary.totalArrivals).toBe(2);
  });
});
