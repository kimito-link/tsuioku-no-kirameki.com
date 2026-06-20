import { describe, it, expect } from 'vitest';
import {
  buildReportPreview,
  buildReportPreviewLines,
  extractReportPreviewInputs
} from './reportPreview.js';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { analyzeAudienceEngagementGap } from './audienceEngagementGap.js';

const t = Date.parse('2026-05-29T12:00:00.000Z');

/** 当該配信の保存コメントを N 件作る(本文ありで KPI 母数に乗る)。 */
function makeComments(n, lv = 'lv1') {
  return Array.from({ length: n }, (_, i) => ({
    liveId: lv,
    text: `c${i}`,
    userId: String(1000 + (i % 12)),
    capturedAt: t + i * 1000
  }));
}

describe('buildReportPreview(実関数で結線=保存前に中身が取れる)', () => {
  it('実 aggregateMarketingReport / analyzeAudienceEngagementGap から KPI を取り出す', () => {
    const comments = makeComments(60, 'lv1');
    const p = buildReportPreview(
      aggregateMarketingReport,
      analyzeAudienceEngagementGap,
      comments,
      'lv1',
      { totalVisitors: 1200, officialCommentCount: 60 }
    );

    expect(p.liveId).toBe('lv1');
    // マーケ集計と一致(レポートと同じ値)。
    expect(p.totalComments).toBe(60);
    expect(p.uniqueUsers).toBe(12);
    expect(p.commentsPerMinute).toBeGreaterThan(0);
    // segmentPcts は数値で取り出せている。
    expect(p.heavyPct).toBeGreaterThanOrEqual(0);
    expect(p.oncePct).toBeGreaterThanOrEqual(0);
    // 来場と応援参加(audienceGap)。
    expect(p.visitors).toBe(1200);
    expect(p.commenters).toBe(12);
    expect(p.silentEstimate).toBe(1188);
  });

  it('liveId は正規化(trim+lower)する', () => {
    const p = buildReportPreview(
      aggregateMarketingReport,
      analyzeAudienceEngagementGap,
      makeComments(3, 'lv1'),
      '  LV1  '
    );
    expect(p.liveId).toBe('lv1');
  });

  it('別配信のコメントは集計母数に乗らない(liveId フィルタ)', () => {
    const mixed = [...makeComments(10, 'lv1'), ...makeComments(40, 'lv999')];
    const p = buildReportPreview(
      aggregateMarketingReport,
      analyzeAudienceEngagementGap,
      mixed,
      'lv1'
    );
    expect(p.totalComments).toBe(10);
  });
});

describe('buildReportPreview(DI で堅牢性=producer 不在/例外でも落ちない)', () => {
  it('コメント空なら全 0(producer は呼ぶが落とさない)', () => {
    const p = buildReportPreview(
      aggregateMarketingReport,
      analyzeAudienceEngagementGap,
      [],
      'lv1'
    );
    expect(p.totalComments).toBe(0);
    expect(p.uniqueUsers).toBe(0);
    expect(p.visitors).toBe(0);
  });

  it('aggregate が throw しても gap 側は生き、数値は 0 で埋める', () => {
    const boom = () => {
      throw new Error('boom');
    };
    const p = buildReportPreview(
      boom,
      analyzeAudienceEngagementGap,
      makeComments(20, 'lv1'),
      'lv1',
      { totalVisitors: 500 }
    );
    expect(p.totalComments).toBe(0); // aggregate 失敗 → 0
    expect(p.visitors).toBe(500); // gap は生きる
    expect(p.commenters).toBe(12);
  });

  it('producer が NaN/undefined を返しても num() で 0 に正規化', () => {
    const dirtyAgg = () => ({
      totalComments: 'x',
      uniqueUsers: undefined,
      commentsPerMinute: NaN,
      segmentPcts: { heavy: null, once: 'abc' }
    });
    const dirtyGap = () => ({ totalVisitors: NaN, uniqueCommenters: undefined });
    const p = buildReportPreview(dirtyAgg, dirtyGap, makeComments(5, 'lv1'), 'lv1');
    expect(p.totalComments).toBe(0);
    expect(p.uniqueUsers).toBe(0);
    expect(p.commentsPerMinute).toBe(0);
    expect(p.heavyPct).toBe(0);
    expect(p.oncePct).toBe(0);
    expect(p.visitors).toBe(0);
    expect(p.commenters).toBe(0);
  });

  it('broadcasterUserId は両 producer に options で渡る(配信者除外)', () => {
    let aggOpts = null;
    let gapOpts = null;
    const spyAgg = (_rows, _lid, opts) => {
      aggOpts = opts;
      return { totalComments: 1 };
    };
    const spyGap = (_input, opts) => {
      gapOpts = opts;
      return { totalVisitors: 0 };
    };
    buildReportPreview(spyAgg, spyGap, makeComments(2, 'lv1'), 'lv1', {
      broadcasterUserId: '4046119'
    });
    expect(aggOpts.broadcasterUserId).toBe('4046119');
    expect(gapOpts.broadcasterUserId).toBe('4046119');
    expect(gapOpts.liveId).toBe('lv1');
  });
});

describe('extractReportPreviewInputs(snapshot から opts)', () => {
  it('有限数の来場/公式コメント数と配信者IDを取り出す', () => {
    const o = extractReportPreviewInputs({
      viewerCountFromDom: 1200,
      officialCommentCount: 340,
      broadcasterUserId: ' 4046119 '
    });
    expect(o).toEqual({
      broadcasterUserId: '4046119',
      totalVisitors: 1200,
      officialCommentCount: 340
    });
  });

  it('非有限/欠落は undefined(gap 側が他経路で推定)', () => {
    expect(extractReportPreviewInputs({ viewerCountFromDom: null }).totalVisitors).toBeUndefined();
    expect(extractReportPreviewInputs({ officialCommentCount: 'x' }).officialCommentCount).toBeUndefined();
    expect(extractReportPreviewInputs(null)).toEqual({
      broadcasterUserId: '',
      totalVisitors: undefined,
      officialCommentCount: undefined
    });
  });
});

describe('buildReportPreviewLines(速報行の整形)', () => {
  it('コメント0なら空文字(ノイズにしない)', () => {
    expect(buildReportPreviewLines(null)).toBe('');
    expect(buildReportPreviewLines(undefined)).toBe('');
    expect(buildReportPreviewLines({ totalComments: 0 })).toBe('');
  });

  it('本文ありなら主要 KPI を1行に並べる', () => {
    const line = buildReportPreviewLines({
      totalComments: 1234,
      uniqueUsers: 50,
      commentsPerMinute: 8.5,
      heavyPct: 12.3,
      oncePct: 40
    });
    expect(line).toContain('レポート内容(保存前)');
    expect(line).toContain('本文コメント 1,234');
    expect(line).toContain('ユニーク 50人');
    expect(line).toContain('分速 8.5');
    expect(line).toContain('ヘビー 12.3%');
    expect(line).toContain('一度きり 40%');
    expect(line).not.toContain('来場と応援参加'); // visitors なし → 2行目なし
  });

  it('来場/コメント者があれば2行目に来場と応援参加を出す', () => {
    const line = buildReportPreviewLines({
      totalComments: 100,
      uniqueUsers: 20,
      visitors: 1200,
      commenters: 20,
      silentEstimate: 1180
    });
    expect(line).toContain('来場と応援参加: 来場 1,200');
    expect(line).toContain('コメントした人 20');
    expect(line).toContain('沈黙視聴者(推定) 1,180');
    expect(line.split('\n').length).toBe(2);
  });

  it('0 の KPI は省略する(余計な「分速 0」等を出さない)', () => {
    const line = buildReportPreviewLines({
      totalComments: 5,
      uniqueUsers: 0,
      commentsPerMinute: 0,
      heavyPct: 0,
      oncePct: 0
    });
    expect(line).toBe('レポート内容(保存前): 本文コメント 5');
  });
});
