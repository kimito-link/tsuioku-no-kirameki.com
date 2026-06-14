import { describe, expect, it } from 'vitest';
import {
  resolveVenueHeatLevel,
  heatLevelToWarmColor,
  heatLevelToGlowOpacity,
  heatLevelToLabel,
  VENUE_HEAT_WINDOW_MS,
  VENUE_HEAT_FULL_PER_MIN
} from './venueHeat.js';

describe('resolveVenueHeatLevel', () => {
  const NOW = 1_000_000;
  it('コメント0件は熱量0', () => {
    expect(resolveVenueHeatLevel([], { now: NOW })).toBe(0);
    expect(resolveVenueHeatLevel([{ capturedAt: null }], { now: NOW })).toBe(0);
  });
  it('窓外(古い)コメントは数えない', () => {
    const rows = [{ capturedAt: NOW - VENUE_HEAT_WINDOW_MS - 1 }];
    expect(resolveVenueHeatLevel(rows, { now: NOW })).toBe(0);
  });
  it('窓内コメントが多いほど熱量が上がる(単調)', () => {
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ capturedAt: NOW - i * 100 }));
    const a = resolveVenueHeatLevel(mk(2), { now: NOW });
    const b = resolveVenueHeatLevel(mk(10), { now: NOW });
    const c = resolveVenueHeatLevel(mk(40), { now: NOW });
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
  it('満熱(fullPerMin 相当)で 1.0 付近に達し・1.0 を超えない', () => {
    // 20秒窓で fullPerMin=60件/分 → 窓内20件で満熱。怒涛(100件)でも 1.0 で頭打ち。
    const mk = (n) => Array.from({ length: n }, () => ({ capturedAt: NOW - 1000 }));
    const full = resolveVenueHeatLevel(mk(20), { now: NOW });
    const flood = resolveVenueHeatLevel(mk(100), { now: NOW });
    expect(full).toBeCloseTo(1, 1);
    expect(flood).toBe(1);
  });
  it('未来時刻(時計ずれ)は now にクランプして数える', () => {
    const rows = [{ capturedAt: NOW + 99_999 }];
    expect(resolveVenueHeatLevel(rows, { now: NOW })).toBeGreaterThan(0);
  });
  it('既定の定数が公開されている', () => {
    expect(VENUE_HEAT_WINDOW_MS).toBeGreaterThan(0);
    expect(VENUE_HEAT_FULL_PER_MIN).toBeGreaterThan(0);
  });
});

describe('heatLevelToWarmColor', () => {
  it('level=0 は涼色・level=1 は暖色', () => {
    expect(heatLevelToWarmColor(0)).toBe('rgb(70, 90, 140)');
    expect(heatLevelToWarmColor(1)).toBe('rgb(255, 150, 60)');
  });
  it('赤成分は熱いほど増え・青成分は減る', () => {
    const cool = heatLevelToWarmColor(0.1);
    const hot = heatLevelToWarmColor(0.9);
    const r = (s) => Number(s.match(/rgb\((\d+)/)[1]);
    const b = (s) => Number(s.match(/, (\d+)\)$/)[1]);
    expect(r(hot)).toBeGreaterThan(r(cool));
    expect(b(hot)).toBeLessThan(b(cool));
  });
  it('範囲外/不正入力はクランプ(0 扱い含む)', () => {
    expect(heatLevelToWarmColor(-1)).toBe('rgb(70, 90, 140)');
    expect(heatLevelToWarmColor(5)).toBe('rgb(255, 150, 60)');
    expect(heatLevelToWarmColor(NaN)).toBe('rgb(70, 90, 140)');
  });
});

describe('heatLevelToGlowOpacity', () => {
  it('過疎はほぼ透明・満熱で濃くなる(単調)', () => {
    expect(heatLevelToGlowOpacity(0)).toBeCloseTo(0.06, 5);
    expect(heatLevelToGlowOpacity(1)).toBeCloseTo(0.34, 5);
    expect(heatLevelToGlowOpacity(0.5)).toBeGreaterThan(heatLevelToGlowOpacity(0));
    expect(heatLevelToGlowOpacity(0.5)).toBeLessThan(heatLevelToGlowOpacity(1));
  });
  it('min/max を上書きできる', () => {
    expect(heatLevelToGlowOpacity(1, { min: 0.1, max: 0.5 })).toBeCloseTo(0.5, 5);
  });
});

describe('heatLevelToLabel', () => {
  it('段階ごとのラベルを返す', () => {
    expect(heatLevelToLabel(0)).toBe('静か');
    expect(heatLevelToLabel(0.3)).toBe('おだやか');
    expect(heatLevelToLabel(0.6)).toBe('盛り上がり');
    expect(heatLevelToLabel(0.9)).toBe('大盛況');
  });
});
