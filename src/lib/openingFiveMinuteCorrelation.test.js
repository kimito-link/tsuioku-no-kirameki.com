import { describe, it, expect } from 'vitest';
import { buildOpeningFiveMinutePoints } from './openingFiveMinuteCorrelation.js';

const D = (m) => Date.UTC(2026, 3, 30, 10, m, 0);

describe('buildOpeningFiveMinutePoints', () => {
  it('入力なし → 空', () => {
    const r = buildOpeningFiveMinutePoints([]);
    expect(r.points).toEqual([]);
  });

  it('各放送について 冒頭5分の CPM とピーク CPM を返す', () => {
    const r = buildOpeningFiveMinutePoints([
      {
        liveId: 'lv1',
        comments: [
          { capturedAt: D(0) }, { capturedAt: D(0) }, { capturedAt: D(1) },
          { capturedAt: D(2) }, { capturedAt: D(3) }, { capturedAt: D(4) },
          { capturedAt: D(20) }, { capturedAt: D(20) }, { capturedAt: D(20) },
          { capturedAt: D(20) }, { capturedAt: D(20) }, { capturedAt: D(20) },
          { capturedAt: D(20) }, { capturedAt: D(20) }, { capturedAt: D(20) },
          { capturedAt: D(20) }
        ]
      }
    ]);
    expect(r.points.length).toBe(1);
    // 冒頭 5 分のコメ件数 = 6 (D(0)..D(4))
    expect(r.points[0].openingComments).toBe(6);
    // 冒頭 5 分の CPM = 6/5 = 1.2
    expect(r.points[0].openingCpm).toBeCloseTo(1.2, 2);
    // ピーク (1分粒度) = 20分目に 10 件 → CPM = 10
    expect(r.points[0].peakCpm).toBe(10);
  });

  it('短い放送は冒頭 5 分丸ごとが配信全体になる', () => {
    const r = buildOpeningFiveMinutePoints([
      {
        liveId: 'lv1',
        comments: [
          { capturedAt: D(0) }, { capturedAt: D(0) }, { capturedAt: D(1) }
        ]
      }
    ]);
    expect(r.points[0].openingComments).toBe(3);
  });

  it('破損 capturedAt は除外', () => {
    const r = buildOpeningFiveMinutePoints([
      {
        liveId: 'lv1',
        comments: [
          { capturedAt: D(0) },
          { capturedAt: NaN },
          { capturedAt: D(2) }
        ]
      }
    ]);
    expect(r.points[0].openingComments).toBe(2);
  });

  it('複数放送 → 散布図用に各点', () => {
    const r = buildOpeningFiveMinutePoints([
      { liveId: 'lv1', comments: [{ capturedAt: D(0) }] },
      { liveId: 'lv2', comments: [{ capturedAt: D(0) }, { capturedAt: D(0) }] }
    ]);
    expect(r.points.length).toBe(2);
  });

  it('null/undefined → 空', () => {
    expect(buildOpeningFiveMinutePoints(null).points).toEqual([]);
    expect(buildOpeningFiveMinutePoints(undefined).points).toEqual([]);
  });

  it('Pearson の相関係数を返す', () => {
    // 4 ポイントで増加相関 → r ≈ 1
    const r = buildOpeningFiveMinutePoints([
      { liveId: 'a', comments: Array.from({ length: 5 }, () => ({ capturedAt: D(0) })) },     // open=5/5=1, peak=5
      { liveId: 'b', comments: Array.from({ length: 10 }, () => ({ capturedAt: D(0) })) },    // open=10/5=2, peak=10
      { liveId: 'c', comments: Array.from({ length: 15 }, () => ({ capturedAt: D(0) })) },    // open=15/5=3, peak=15
      { liveId: 'd', comments: Array.from({ length: 20 }, () => ({ capturedAt: D(0) })) }     // open=20/5=4, peak=20
    ]);
    expect(r.correlation).toBeCloseTo(1, 1);
  });

  it('1 件のみ → 相関は null', () => {
    const r = buildOpeningFiveMinutePoints([
      { liveId: 'a', comments: [{ capturedAt: D(0) }] }
    ]);
    expect(r.correlation).toBeNull();
  });
});
