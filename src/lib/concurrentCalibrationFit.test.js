import { describe, it, expect } from 'vitest';
import {
  computeCalibrationFit,
  CALIBRATION_FIT_MIN_TRUTH_SAMPLES,
  CALIBRATION_FIT_MIN_CROSS_SAMPLES
} from './concurrentCalibrationFit.js';

/** @param {number} i @param {object} extra */
function baseSample(i, extra) {
  return {
    ts: 1_700_000_000_000 + i * 60000,
    platform: 'niconico',
    liveId: `lv${100000 + i}`,
    source: 'manual',
    ...extra
  };
}

describe('computeCalibrationFit', () => {
  it('サンプル不足なら insufficient・推奨値 null・ready false', () => {
    const items = [
      baseSample(0, { signalA: 100, signalB: 400, totalVisitors: 2000, streamAgeMin: 50 })
    ];
    const r = computeCalibrationFit({ items });
    expect(r.basis).toBe('insufficient');
    expect(r.ready).toBe(false);
    expect(r.suggested.avgSessionMin).toBeNull();
    expect(r.suggested.perPersonCommentsPerMin).toBeNull();
  });

  it('クロスシグナル: geomean(A,B) を擬似真値に係数を逆算する', () => {
    const items = [];
    for (let i = 0; i < CALIBRATION_FIT_MIN_CROSS_SAMPLES + 5; i++) {
      items.push(
        baseSample(i, {
          signalA: 100,
          signalB: 400, // R = geomean = 200
          signalC: 150,
          signalD: 250,
          blended: 210,
          totalVisitors: 2000,
          streamAgeMin: 50, // vpm = 40
          commentsPerMin: 10
        })
      );
    }
    const r = computeCalibrationFit({ items });
    expect(r.basis).toBe('cross-signal');
    expect(r.ready).toBe(true);
    // avgSessionMin = R / vpm = 200 / 40 = 5
    expect(r.suggested.avgSessionMin).toBeCloseTo(5, 1);
    // perPerson = commentsPerMin / R = 10 / 200 = 0.05
    expect(r.suggested.perPersonCommentsPerMin).toBeCloseTo(0.05, 3);
    // multiplierScale = R / signalA = 200 / 100 = 2
    expect(r.suggested.multiplierScale).toBeCloseTo(2, 2);
    // 真値が無いので blend 誤差は null
    expect(r.quality.medianAbsBlendErrorPct).toBeNull();
    expect(r.quality.medianSignalDispersionPct).not.toBeNull();
  });

  it('公式同接の真値があれば official フィット＋blend誤差を出す', () => {
    const items = [];
    for (let i = 0; i < CALIBRATION_FIT_MIN_TRUTH_SAMPLES + 2; i++) {
      items.push(
        baseSample(i, {
          platform: 'youtube',
          signalA: 150,
          signalB: 600,
          blended: 270,
          totalVisitors: 3000,
          streamAgeMin: 60, // vpm = 50
          commentsPerMin: 30,
          officialConcurrent: 300
        })
      );
    }
    const r = computeCalibrationFit({ items }, { platform: 'youtube' });
    expect(r.basis).toBe('official');
    expect(r.withTruthCount).toBeGreaterThanOrEqual(CALIBRATION_FIT_MIN_TRUTH_SAMPLES);
    // avgSessionMin = 300 / 50 = 6
    expect(r.suggested.avgSessionMin).toBeCloseTo(6, 1);
    // perPerson = 30 / 300 = 0.1
    expect(r.suggested.perPersonCommentsPerMin).toBeCloseTo(0.1, 3);
    // multiplierScale = 300 / 150 = 2
    expect(r.suggested.multiplierScale).toBeCloseTo(2, 2);
    // blended=270 vs official=300 → 10%
    expect(r.quality.medianAbsBlendErrorPct).toBeCloseTo(10, 1);
  });

  it('clamp: 異常に大きい/小さい逆算値は健全域に収める', () => {
    const items = [];
    for (let i = 0; i < CALIBRATION_FIT_MIN_CROSS_SAMPLES + 1; i++) {
      items.push(
        baseSample(i, {
          signalA: 1, // R/signalA が極端に大きい → multiplierScale は上限 3 に
          signalB: 10000,
          totalVisitors: 10,
          streamAgeMin: 600, // vpm 極小 → avgSessionMin 上限 240 に
          commentsPerMin: 100000 // perPerson 上限 5 に
        })
      );
    }
    const r = computeCalibrationFit({ items });
    expect(r.suggested.multiplierScale).toBeLessThanOrEqual(3);
    expect(r.suggested.avgSessionMin).toBeLessThanOrEqual(240);
    expect(r.suggested.perPersonCommentsPerMin).toBeLessThanOrEqual(5);
  });
});
