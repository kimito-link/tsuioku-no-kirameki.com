import { describe, it, expect } from 'vitest';
import {
  buildRecentBroadcastComparison,
  buildWeekdayHourHeatmap,
  computeBroadcastGrowthScore
} from './broadcastCrossCompare.js';

const D = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h, min, 0);

describe('buildRecentBroadcastComparison', () => {
  it('入力なし → 空', () => {
    const r = buildRecentBroadcastComparison({ broadcasts: [] });
    expect(r.bars).toEqual([]);
  });

  it('各放送のコメ数・ユニーク・配信時間を計算', () => {
    const r = buildRecentBroadcastComparison({
      broadcasts: [
        {
          liveId: 'lv1',
          comments: [
            { userId: 'A', capturedAt: D(2026, 4, 1, 10, 0) },
            { userId: 'B', capturedAt: D(2026, 4, 1, 10, 30) },
            { userId: 'A', capturedAt: D(2026, 4, 1, 11, 0) }
          ]
        },
        {
          liveId: 'lv2',
          comments: [
            { userId: 'C', capturedAt: D(2026, 4, 5, 20, 0) },
            { userId: 'D', capturedAt: D(2026, 4, 5, 20, 30) }
          ]
        }
      ]
    });
    expect(r.bars.length).toBe(2);
    expect(r.bars[0].liveId).toBe('lv1');
    expect(r.bars[0].totalComments).toBe(3);
    expect(r.bars[0].uniqueUsers).toBe(2);
    expect(r.bars[0].durationMin).toBe(60);
    expect(r.bars[1].liveId).toBe('lv2');
    expect(r.bars[1].totalComments).toBe(2);
  });

  it('null/undefined 入力 → 空', () => {
    expect(buildRecentBroadcastComparison(null).bars).toEqual([]);
    expect(buildRecentBroadcastComparison(undefined).bars).toEqual([]);
  });

  it('上限 limit で件数制限（古い順に古いものを drop）', () => {
    const list = [
      { liveId: 'a', comments: [{ userId: 'X', capturedAt: D(2026, 4, 1, 10, 0) }] },
      { liveId: 'b', comments: [{ userId: 'X', capturedAt: D(2026, 4, 2, 10, 0) }] },
      { liveId: 'c', comments: [{ userId: 'X', capturedAt: D(2026, 4, 3, 10, 0) }] }
    ];
    const r = buildRecentBroadcastComparison({ broadcasts: list, limit: 2 });
    expect(r.bars.map((b) => b.liveId)).toEqual(['b', 'c']);
  });

  it('順序は capturedAt の最初の時刻で sort（古→新）', () => {
    const r = buildRecentBroadcastComparison({
      broadcasts: [
        { liveId: 'lv-late', comments: [{ userId: 'A', capturedAt: D(2026, 4, 5, 10, 0) }] },
        { liveId: 'lv-early', comments: [{ userId: 'A', capturedAt: D(2026, 4, 1, 10, 0) }] }
      ]
    });
    expect(r.bars.map((b) => b.liveId)).toEqual(['lv-early', 'lv-late']);
  });
});

describe('buildWeekdayHourHeatmap', () => {
  it('複数放送のコメ時刻を 7曜日 × 24時間 マトリクスに集計', () => {
    const r = buildWeekdayHourHeatmap({
      broadcasts: [
        // 2026-04-30 (Thursday=4) 22:00 と 22:15 → cell [4][22]=2
        {
          liveId: 'lv1',
          comments: [
            { capturedAt: D(2026, 4, 30, 22, 0) },
            { capturedAt: D(2026, 4, 30, 22, 15) }
          ]
        },
        // 2026-05-01 (Friday=5) 21:00 → cell [5][21]=1
        { liveId: 'lv2', comments: [{ capturedAt: D(2026, 5, 1, 21, 0) }] }
      ]
    });
    expect(r.matrix.length).toBe(7);
    expect(r.matrix[0].length).toBe(24);
    // Thursday は getDay()=4, capturedAt は UTC だが getDay() はローカル時刻基準の場合がある
    // テストではタイムゾーン依存を避けるため、合計値で判定。
    const total = r.matrix.flat().reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
    expect(r.maxValue).toBeGreaterThanOrEqual(1);
  });

  it('入力なし → 7x24 ゼロ行列', () => {
    const r = buildWeekdayHourHeatmap({ broadcasts: [] });
    expect(r.matrix.length).toBe(7);
    expect(r.matrix.every((row) => row.length === 24)).toBe(true);
    expect(r.maxValue).toBe(0);
  });
});

describe('computeBroadcastGrowthScore', () => {
  it('現在値が過去平均より大きい → 正の成長スコア', () => {
    const r = computeBroadcastGrowthScore({
      currentValue: 100,
      pastValues: [50, 60, 70, 80, 90]
    });
    // 平均 = 70, 標準偏差 ≈ 14.14, z = (100-70)/14.14 ≈ 2.12
    expect(r.average).toBe(70);
    expect(r.zScore).toBeGreaterThan(1.5);
    expect(r.deltaPct).toBeCloseTo(0.4286, 3);
  });

  it('現在値 == 平均 → zScore=0 / delta=0', () => {
    const r = computeBroadcastGrowthScore({
      currentValue: 50,
      pastValues: [40, 50, 60]
    });
    expect(r.zScore).toBe(0);
    expect(r.deltaPct).toBe(0);
  });

  it('過去サンプルなし → null', () => {
    const r = computeBroadcastGrowthScore({ currentValue: 100, pastValues: [] });
    expect(r.average).toBeNull();
    expect(r.zScore).toBeNull();
    expect(r.deltaPct).toBeNull();
  });

  it('過去サンプル 1 件で stddev=0 → zScore は null（分散ゼロ）', () => {
    const r = computeBroadcastGrowthScore({ currentValue: 80, pastValues: [50] });
    expect(r.average).toBe(50);
    expect(r.zScore).toBeNull();
    expect(r.deltaPct).toBeCloseTo(0.6, 1);
  });

  it('null 入力 → 空', () => {
    expect(computeBroadcastGrowthScore(null).average).toBeNull();
  });
});
