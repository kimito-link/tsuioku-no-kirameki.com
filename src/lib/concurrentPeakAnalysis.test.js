import { describe, it, expect } from 'vitest';
import { analyzeConcurrentPeak } from './concurrentPeakAnalysis.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);

function pt(min, value) {
  return { at: t0 + min * 60_000, value, minute: min };
}

function series(points, source = 'official') {
  if (!points.length) {
    return { points: [], maxValue: 0, firstAt: null, lastAt: null, source: 'none' };
  }
  return {
    points,
    maxValue: Math.max(...points.map((p) => p.value)),
    firstAt: points[0].at,
    lastAt: points[points.length - 1].at,
    source
  };
}

describe('analyzeConcurrentPeak', () => {
  it('空シリーズ → null フィールド', () => {
    const r = analyzeConcurrentPeak(series([]));
    expect(r.peakValue).toBe(0);
    expect(r.peakMinute).toBeNull();
    expect(r.endValue).toBe(0);
    expect(r.endRetentionRatio).toBeNull();
    expect(r.halfDecayMinute).toBeNull();
    expect(r.startValue).toBe(0);
  });

  it('1 サンプル → ピーク=サンプル値、end=同じ、保持率=1', () => {
    const r = analyzeConcurrentPeak(series([pt(0, 100)]));
    expect(r.peakValue).toBe(100);
    expect(r.peakMinute).toBe(0);
    expect(r.endValue).toBe(100);
    expect(r.endRetentionRatio).toBe(1);
  });

  it('単調増加 → ピーク=最後 / 終了保持率=1 / 半減点=null', () => {
    const r = analyzeConcurrentPeak(series([
      pt(0, 50),
      pt(5, 100),
      pt(10, 200)
    ]));
    expect(r.peakValue).toBe(200);
    expect(r.peakMinute).toBe(10);
    expect(r.endValue).toBe(200);
    expect(r.endRetentionRatio).toBe(1);
    // ピーク後にデータが無いので半減点 null
    expect(r.halfDecayMinute).toBeNull();
  });

  it('山型: 0→100→50 → ピーク中盤 / 終了保持率=0.5 / 半減点 = ピーク後最初に 50 を割った分', () => {
    const r = analyzeConcurrentPeak(series([
      pt(0, 0),
      pt(2, 50),
      pt(5, 100),
      pt(7, 60),
      pt(10, 50),  // ぴったり半分
      pt(12, 30)   // 半分を割った
    ]));
    expect(r.peakValue).toBe(100);
    expect(r.peakMinute).toBe(5);
    expect(r.endValue).toBe(30);
    expect(r.endRetentionRatio).toBe(0.3);
    // 半減点: ピーク 100 の半分 50 を「割った」最初の分 → minute=12
    expect(r.halfDecayMinute).toBe(12);
  });

  it('startValue は最初のサンプル値', () => {
    const r = analyzeConcurrentPeak(series([pt(0, 30), pt(5, 100)]));
    expect(r.startValue).toBe(30);
  });

  it('ピーク到達は最初に最大値に到達した分（同点ならその最初）', () => {
    const r = analyzeConcurrentPeak(series([
      pt(0, 50),
      pt(2, 100),
      pt(3, 100),
      pt(5, 80)
    ]));
    expect(r.peakValue).toBe(100);
    expect(r.peakMinute).toBe(2);
  });

  it('peakValue が 0 の異常系 → ratio は 0 / halfDecay は null', () => {
    const r = analyzeConcurrentPeak(series([pt(0, 0), pt(5, 0)]));
    expect(r.peakValue).toBe(0);
    expect(r.endRetentionRatio).toBe(null);
    expect(r.halfDecayMinute).toBeNull();
  });

  it('null/undefined 入力 → 空フィールド', () => {
    const r = analyzeConcurrentPeak(null);
    expect(r.peakMinute).toBeNull();
    const r2 = analyzeConcurrentPeak(undefined);
    expect(r2.peakMinute).toBeNull();
  });

  it('endRetentionRatio は 3 桁丸め', () => {
    const r = analyzeConcurrentPeak(series([pt(0, 100), pt(10, 33)]));
    // ratio = 33/100 = 0.33
    expect(r.endRetentionRatio).toBe(0.33);
  });
});
