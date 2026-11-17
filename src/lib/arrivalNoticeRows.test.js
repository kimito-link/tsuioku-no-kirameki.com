/**
 * 同じ来場の文面でも、時刻が違えば別件数。約2秒以内の同じ通知だけ1回。
 * 内訳とレポートは同じ行を数える。
 */
import { describe, it, expect } from 'vitest';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { summarizeCommentRecordBreakdown } from './commentRecordBreakdown.js';
import { normalizeTailRowsForDisplay } from './readAllCommentsForLive.js';

const LV = 'lv351831423';
const BASE = 1_700_000_000_000;
const TEXT = '「サッカー」が好きな1人が来場しました';

function row(id, capturedAt) {
  return {
    id,
    liveId: LV,
    commentNo: '',
    text: TEXT,
    userId: null,
    capturedAt
  };
}

function counts(rows) {
  const panel = summarizeCommentRecordBreakdown(rows);
  const report = aggregateMarketingReport(rows, LV);
  return {
    panel: panel.interestArrival,
    report: report.interestArrivalSummary.messageCount,
    people: report.interestArrivalSummary.totalArrivals
  };
}

describe('来場は時刻で区別し、二重取り込みだけ畳む', () => {
  it('同じ文面が時刻違いで3件なら、内訳もレポートも3', () => {
    const rows = [0, 10_000, 20_000].map((dt, i) => row(`a${i}`, BASE + dt));
    const got = counts(rows);
    expect(got).toEqual({ panel: 3, report: 3, people: 3 });
  });

  it('公式と画面が1秒以内に同じ通知を取り込んだら1回', () => {
    const rows = [row('ndgr', BASE), row('dom', BASE + 1000)];
    const got = counts(rows);
    expect(got).toEqual({ panel: 1, report: 1, people: 1 });
  });

  it('未保存の末尾も放送の番号を付けて、内訳とレポートが一致する', () => {
    const displayNow = BASE + 999_999;
    const tail = normalizeTailRowsForDisplay(
      [
        { text: TEXT, capturedAt: BASE },
        { text: TEXT, capturedAt: BASE + 10_000 },
        { text: TEXT, capturedAt: BASE + 20_000 }
      ],
      LV,
      displayNow
    );
    expect(tail.map((r) => r.liveId)).toEqual([LV, LV, LV]);
    expect(tail.map((r) => r.capturedAt)).toEqual([BASE, BASE + 10_000, BASE + 20_000]);
    const got = counts(tail);
    expect(got.panel).toBe(got.report);
    expect(got).toEqual({ panel: 3, report: 3, people: 3 });
  });

  it('時刻が無い行は、同じ文面でも落とさない', () => {
    const tail = normalizeTailRowsForDisplay(
      [{ text: TEXT }, { text: TEXT }],
      LV,
      BASE
    );
    expect(tail[0].capturedAt).toBeUndefined();
    expect(tail[1].capturedAt).toBeUndefined();
    const got = counts(tail);
    expect(got).toEqual({ panel: 2, report: 2, people: 2 });
  });
});
