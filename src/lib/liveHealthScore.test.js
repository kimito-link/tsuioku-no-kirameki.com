import { describe, it, expect } from 'vitest';
import {
  scoreCaptureRate,
  scoreRenderHealth,
  scoreFreshness,
  scoreScrollLightness,
  buildLiveHealth,
  scoreToDots
} from './liveHealthScore.js';

describe('scoreCaptureRate', () => {
  it('境界値', () => {
    expect(scoreCaptureRate(100)).toBe(5);
    expect(scoreCaptureRate(95)).toBe(5);
    expect(scoreCaptureRate(80)).toBe(4);
    expect(scoreCaptureRate(60)).toBe(3);
    expect(scoreCaptureRate(40)).toBe(2);
    expect(scoreCaptureRate(20)).toBe(1);
    expect(scoreCaptureRate(5)).toBe(0);
    expect(scoreCaptureRate(null)).toBe(0);
  });
});

describe('scoreRenderHealth', () => {
  it('前面は描画回数で評価', () => {
    expect(scoreRenderHealth({ paintCount: 86, tabVisible: true })).toBe(5);
    expect(scoreRenderHealth({ paintCount: 12, tabVisible: true })).toBe(4);
    expect(scoreRenderHealth({ paintCount: 1, tabVisible: true })).toBe(2);
    expect(scoreRenderHealth({ paintCount: 0, tabVisible: true })).toBe(1);
  });
  it('裏タブは省電力でも描画あれば4', () => {
    expect(scoreRenderHealth({ paintCount: 12, tabVisible: false })).toBe(4);
    expect(scoreRenderHealth({ paintCount: 0, tabVisible: false })).toBe(2);
  });
  it('perfDiag なしは0', () => {
    expect(scoreRenderHealth(null)).toBe(0);
  });
});

describe('scoreFreshness', () => {
  it('境界値', () => {
    expect(scoreFreshness(5000)).toBe(5);
    expect(scoreFreshness(30000)).toBe(4);
    expect(scoreFreshness(60000)).toBe(3);
    expect(scoreFreshness(180000)).toBe(2);
    expect(scoreFreshness(600000)).toBe(1);
    expect(scoreFreshness(900000)).toBe(0);
    expect(scoreFreshness(null)).toBe(0);
  });
});

describe('scoreScrollLightness', () => {
  it('paint ms が小さいほど高い', () => {
    expect(scoreScrollLightness({ lastPaintMs: 12 })).toBe(5);
    expect(scoreScrollLightness({ lastPaintMs: 40 })).toBe(4);
    expect(scoreScrollLightness({ lastPaintMs: 80 })).toBe(3);
    expect(scoreScrollLightness({ lastPaintMs: 300 })).toBe(1);
    expect(scoreScrollLightness({ lastPaintMs: 999 })).toBe(0);
    expect(scoreScrollLightness(null)).toBe(0);
  });
});

describe('buildLiveHealth', () => {
  it('実機相当(刑事桃: 取得44% paint62ms 描画90 前面 1秒前)', () => {
    const live = {
      officialRatePct: 44,
      lastIngestAgoMs: 1000,
      perfDiag: { paintCount: 90, tabVisible: true, lastPaintMs: 62 }
    };
    expect(buildLiveHealth(live)).toEqual({
      capture: 2,
      render: 5,
      freshness: 5,
      scroll: 3
    });
  });
  it('null セーフ', () => {
    expect(buildLiveHealth(null)).toEqual({
      capture: 0,
      render: 0,
      freshness: 0,
      scroll: 0
    });
  });
});

describe('scoreToDots', () => {
  it('●○ に変換', () => {
    expect(scoreToDots(3)).toBe('●●●○○');
    expect(scoreToDots(5)).toBe('●●●●●');
    expect(scoreToDots(0)).toBe('○○○○○');
  });
});
