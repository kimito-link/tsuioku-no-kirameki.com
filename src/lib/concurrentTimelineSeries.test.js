import { describe, it, expect } from 'vitest';
import { buildConcurrentTimelineSeries } from './concurrentTimelineSeries.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);

function row(min, opts = {}) {
  return {
    capturedAt: t0 + min * 60_000,
    officialViewerCount:
      'official' in opts ? opts.official : null,
    peakConcurrentEstimate:
      'estimated' in opts ? opts.estimated : null
  };
}

describe('buildConcurrentTimelineSeries', () => {
  it('行が無い → 空シリーズ', () => {
    const r = buildConcurrentTimelineSeries([]);
    expect(r.points).toEqual([]);
    expect(r.maxValue).toBe(0);
    expect(r.firstAt).toBeNull();
    expect(r.lastAt).toBeNull();
    expect(r.source).toBe('none');
  });

  it('officialViewerCount があれば優先して使う', () => {
    const rows = [row(0, { official: 100 }), row(5, { official: 250 })];
    const r = buildConcurrentTimelineSeries(rows);
    expect(r.points.length).toBe(2);
    expect(r.points[0]).toEqual({ at: t0, value: 100, minute: 0 });
    expect(r.points[1]).toEqual({ at: t0 + 5 * 60_000, value: 250, minute: 5 });
    expect(r.maxValue).toBe(250);
    expect(r.source).toBe('official');
  });

  it('officialViewerCount が一切無く、peakConcurrentEstimate のみあれば fallback で使う', () => {
    const rows = [row(0, { estimated: 80 }), row(2, { estimated: 95 })];
    const r = buildConcurrentTimelineSeries(rows);
    expect(r.points[0].value).toBe(80);
    expect(r.points[1].value).toBe(95);
    expect(r.source).toBe('estimated');
  });

  it('混在: official が部分的にだけある場合は official のあるサンプルだけ使う（estimated は混ぜない）', () => {
    const rows = [
      row(0, { official: 100 }),
      row(1, { official: null, estimated: 40 }),
      row(2, { official: 220 })
    ];
    const r = buildConcurrentTimelineSeries(rows);
    // official が 1 件以上あるので source=official、estimated 行は捨てる
    expect(r.source).toBe('official');
    expect(r.points.length).toBe(2);
    expect(r.points[0].value).toBe(100);
    expect(r.points[1].value).toBe(220);
  });

  it('時系列ソート: 順不同入力でも capturedAt 昇順で並ぶ', () => {
    const rows = [row(5, { official: 250 }), row(0, { official: 100 }), row(2, { official: 180 })];
    const r = buildConcurrentTimelineSeries(rows);
    expect(r.points.map((p) => p.minute)).toEqual([0, 2, 5]);
  });

  it('firstAt / lastAt は capturedAt の min/max', () => {
    const rows = [row(0, { official: 1 }), row(10, { official: 2 })];
    const r = buildConcurrentTimelineSeries(rows);
    expect(r.firstAt).toBe(t0);
    expect(r.lastAt).toBe(t0 + 10 * 60_000);
  });

  it('minute は first からの経過分（0 始まり）', () => {
    const rows = [
      { capturedAt: t0 + 60_000, officialViewerCount: 10 },
      { capturedAt: t0 + 5 * 60_000, officialViewerCount: 30 }
    ];
    const r = buildConcurrentTimelineSeries(rows);
    expect(r.points[0].minute).toBe(0);
    expect(r.points[1].minute).toBe(4);
  });

  it('NaN / 負値 / Infinity の viewerCount は除外', () => {
    const rows = [
      row(0, { official: 100 }),
      { capturedAt: t0 + 60_000, officialViewerCount: NaN, peakConcurrentEstimate: null },
      { capturedAt: t0 + 2 * 60_000, officialViewerCount: -5, peakConcurrentEstimate: null },
      { capturedAt: t0 + 3 * 60_000, officialViewerCount: Infinity, peakConcurrentEstimate: null },
      row(5, { official: 200 })
    ];
    const r = buildConcurrentTimelineSeries(rows);
    expect(r.points.length).toBe(2);
  });

  it('1 サンプルだけでも結果を返す', () => {
    const r = buildConcurrentTimelineSeries([row(0, { official: 50 })]);
    expect(r.points.length).toBe(1);
    expect(r.firstAt).toBe(t0);
    expect(r.lastAt).toBe(t0);
    expect(r.maxValue).toBe(50);
  });

  it('null/undefined 入力 → 空シリーズ', () => {
    expect(buildConcurrentTimelineSeries(null).points).toEqual([]);
    expect(buildConcurrentTimelineSeries(undefined).points).toEqual([]);
  });

  it('入力配列を破壊しない（純粋関数）', () => {
    const rows = [row(5, { official: 1 }), row(0, { official: 2 })];
    const before = JSON.stringify(rows);
    buildConcurrentTimelineSeries(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
});
