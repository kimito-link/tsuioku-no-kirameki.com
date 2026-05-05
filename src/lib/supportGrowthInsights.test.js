import { describe, it, expect } from 'vitest';
import { buildSupportGrowthInsights, buildReportMemoPayload } from './supportGrowthInsights.js';
import { aggregateMarketingReport } from './marketingAggregate.js';

/** @returns {import('./commentRecord.js').StoredComment[]} */
function makeComments(n, startAt) {
  /** @type {import('./commentRecord.js').StoredComment[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `c${i}`,
      liveId: 'lvtest',
      commentNo: String(i),
      text: i % 5 === 0 ? 'わろたｗｗ' : i % 7 === 0 ? '楽しい' : `hello ${i}`,
      userId: `u${i % 15}`,
      nickname: '',
      capturedAt: startAt + i * 4000,
      vpos: null,
      is184: false,
      selfPosted: false
    });
  }
  return out;
}

describe('buildSupportGrowthInsights', () => {
  it('コメントが少ないときは控えめな提案になる', () => {
    const cs = makeComments(5, Date.now() - 20_000);
    const r = aggregateMarketingReport(cs, 'lvtest');
    const ins = buildSupportGrowthInsights({ report: r, comments: cs });
    expect(ins.nextActions.length).toBeGreaterThanOrEqual(1);
    expect(ins.adviceSlice.lowData).toBe(true);
    expect(ins.nextActions[0].because).toMatch(/少なく/);
  });

  it('ポジティブ寄りの語が多いと応援向きの時間帯メモが付きやすい', () => {
    const base = Date.now() - 600_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const cs = [];
    for (let i = 0; i < 80; i++) {
      cs.push({
        id: `p${i}`,
        liveId: 'lvtest',
        commentNo: String(i),
        text: i % 3 === 0 ? '最高ありがとう' : '楽しいね',
        userId: `u${i % 20}`,
        nickname: '',
        capturedAt: base + i * 3000,
        vpos: null,
        is184: false,
        selfPosted: false
      });
    }
    const r = aggregateMarketingReport(cs, 'lvtest');
    const ins = buildSupportGrowthInsights({ report: r, comments: cs });
    expect(ins.supportWindows.length).toBeGreaterThan(0);
    expect(ins.adviceSlice.positiveLean).toBe(true);
  });

  it('maskShareLabels でニックネームが伏せ字になる', () => {
    const base = Date.now() - 120_000;
    const cs = makeComments(40, base);
    const ins = buildSupportGrowthInsights({
      report: aggregateMarketingReport(cs, 'lvtest'),
      comments: cs,
      giftUsers: [{ userId: '111', nickname: '長いニックネームです', capturedAt: base + 60_000 }],
      maskShareLabels: true
    });
    expect(ins.giftFlow.length).toBeGreaterThan(0);
    const h = ins.giftFlow[0].headline;
    expect(h).not.toContain('長いニックネームです');
    expect(h).toMatch(/さん/);
  });

  it('ギフト行があると giftFlow が出る', () => {
    const base = Date.now() - 300_000;
    const cs = makeComments(50, base);
    const ins = buildSupportGrowthInsights({
      report: aggregateMarketingReport(cs, 'lvtest'),
      comments: cs,
      giftUsers: [{ userId: '99988877', nickname: 'ギフター', capturedAt: base + 100_000 }]
    });
    expect(ins.giftFlow.length).toBeGreaterThan(0);
    expect(ins.adviceSlice.hasGiftSignals).toBe(true);
  });

  it('ギフトがなくても nextActions は出る', () => {
    const cs = makeComments(45, Date.now() - 400_000);
    const ins = buildSupportGrowthInsights({
      report: aggregateMarketingReport(cs, 'lvtest'),
      comments: cs,
      giftUsers: []
    });
    expect(ins.nextActions.length).toBeGreaterThanOrEqual(3);
    expect(ins.giftFlow.length).toBe(0);
  });

  it('buildReportMemoPayload が軽量メモを返す', () => {
    const cs = makeComments(30, Date.now() - 200_000);
    const memo = buildReportMemoPayload({
      report: aggregateMarketingReport(cs, 'lvtest'),
      comments: cs
    });
    expect(memo.nextMemos.length).toBeLessThanOrEqual(3);
    expect(memo.highlights.length).toBeLessThanOrEqual(3);
  });
});
