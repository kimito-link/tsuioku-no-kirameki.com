import { describe, it, expect } from 'vitest';
import {
  pushPaintPerfSample,
  summarizePaintPerf,
  paintPerfHealth,
  PAINT_PERF_RING_MAX
} from './paintPerfLog.js';

describe('pushPaintPerfSample', () => {
  it('サンプルを追加する', () => {
    const r = pushPaintPerfSample([], { ms: 12.34, n: 100, at: 1000 });
    expect(r).toEqual([{ ms: 12.3, n: 100, at: 1000 }]);
  });

  it('不正な ms/at は無視(リング不変)', () => {
    expect(pushPaintPerfSample([], { ms: NaN, at: 1 })).toEqual([]);
    expect(pushPaintPerfSample([], { ms: -1, at: 1 })).toEqual([]);
    expect(pushPaintPerfSample([{ ms: 5, n: 0, at: 1 }], { ms: 5, at: NaN })).toEqual([{ ms: 5, n: 0, at: 1 }]);
  });

  it('上限を超えたら古いものから捨てる', () => {
    let r = [];
    for (let i = 0; i < PAINT_PERF_RING_MAX + 10; i += 1) {
      r = pushPaintPerfSample(r, { ms: i, n: 0, at: i });
    }
    expect(r.length).toBe(PAINT_PERF_RING_MAX);
    expect(r[0].at).toBe(10); // 0..9 が捨てられる
  });

  it('n が無ければ 0', () => {
    expect(pushPaintPerfSample([], { ms: 3, at: 1 })[0].n).toBe(0);
  });
});

describe('summarizePaintPerf', () => {
  it('空は全0', () => {
    expect(summarizePaintPerf([])).toEqual({
      count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, lastMs: 0, lastN: 0, lastAt: 0
    });
  });

  it('平均・最大・最新を出す', () => {
    const ring = [
      { ms: 10, n: 50, at: 1 },
      { ms: 20, n: 60, at: 2 },
      { ms: 30, n: 70, at: 3 }
    ];
    const s = summarizePaintPerf(ring);
    expect(s.count).toBe(3);
    expect(s.avgMs).toBe(20);
    expect(s.maxMs).toBe(30);
    expect(s.lastMs).toBe(30);
    expect(s.lastN).toBe(70);
    expect(s.lastAt).toBe(3);
  });

  it('p95 は大きい方に寄る', () => {
    const ring = Array.from({ length: 20 }, (_, i) => ({ ms: i + 1, n: 0, at: i }));
    const s = summarizePaintPerf(ring);
    expect(s.p95Ms).toBeGreaterThanOrEqual(s.p50Ms);
    expect(s.maxMs).toBe(20);
  });
});

describe('paintPerfHealth', () => {
  it('p95 で good/warn/bad', () => {
    expect(paintPerfHealth({ p95Ms: 8 })).toBe('good');
    expect(paintPerfHealth({ p95Ms: 20 })).toBe('warn');
    expect(paintPerfHealth({ p95Ms: 60 })).toBe('bad');
  });
});
