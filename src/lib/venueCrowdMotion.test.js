import { describe, test, expect } from 'vitest';
import { resolveCrowdMotionProfile, resolveCrowdSpriteMotion } from './venueCrowdMotion.js';

describe('resolveCrowdMotionProfile (盛り上がりで動きが変わる)', () => {
  test('静か(heat=0)はゆっくり・小さく・完全同期', () => {
    const p = resolveCrowdMotionProfile(0);
    expect(p.periodMs).toBe(3600); // 最遅
    expect(p.swayDeg).toBe(4); // ほぼ揺れない呼吸
    expect(p.desync).toBe(0); // 完全同期
    expect(p.breathePx).toBeGreaterThan(0); // それでも微かに呼吸する(静止を避ける)
  });

  test('怒涛(heat=1)は速く・大きく・少しバラける', () => {
    const p = resolveCrowdMotionProfile(1);
    expect(p.periodMs).toBe(1200); // 静かの3倍速
    expect(p.swayDeg).toBe(22);
    expect(p.desync).toBeGreaterThan(0);
    expect(p.breathePx).toBeGreaterThan(resolveCrowdMotionProfile(0).breathePx);
  });

  test('heat が上がるほど速く・大きくなる(単調)', () => {
    const a = resolveCrowdMotionProfile(0.2);
    const b = resolveCrowdMotionProfile(0.8);
    expect(b.periodMs).toBeLessThan(a.periodMs); // 速く
    expect(b.swayDeg).toBeGreaterThan(a.swayDeg); // 大きく
  });

  test('範囲外/不正値はクランプされる', () => {
    expect(resolveCrowdMotionProfile(-5)).toEqual(resolveCrowdMotionProfile(0));
    expect(resolveCrowdMotionProfile(99)).toEqual(resolveCrowdMotionProfile(1));
    expect(resolveCrowdMotionProfile(NaN)).toEqual(resolveCrowdMotionProfile(0));
  });
});

describe('resolveCrowdSpriteMotion (時間で揺れる・同期する)', () => {
  test('揺れ角は ±swayDeg(ラジアン)の範囲に収まる', () => {
    const profile = resolveCrowdMotionProfile(1);
    const maxRad = (profile.swayDeg * Math.PI) / 180;
    for (let t = 0; t < 4000; t += 137) {
      const m = resolveCrowdSpriteMotion(t, 0.3, profile);
      expect(Math.abs(m.swayRad)).toBeLessThanOrEqual(maxRad + 1e-9);
    }
  });

  test('完全同期(desync=0)なら全員が同じ揺れ角', () => {
    const profile = resolveCrowdMotionProfile(0); // desync=0
    const a = resolveCrowdSpriteMotion(1000, 0.1, profile);
    const b = resolveCrowdSpriteMotion(1000, 0.9, profile);
    expect(a.swayRad).toBeCloseTo(b.swayRad, 9); // unitPhase が違っても同じ=同期
  });

  test('盛り上がり時(desync>0)は個体で揺れ角がズレる', () => {
    const profile = resolveCrowdMotionProfile(1); // desync>0
    const a = resolveCrowdSpriteMotion(1000, 0.1, profile);
    const b = resolveCrowdSpriteMotion(1000, 0.9, profile);
    expect(a.swayRad).not.toBeCloseTo(b.swayRad, 3); // ズレる=波打つ
  });

  test('時間が進むと揺れ角が変化する(止まっていない)', () => {
    const profile = resolveCrowdMotionProfile(0.5);
    const m0 = resolveCrowdSpriteMotion(0, 0.5, profile);
    const m1 = resolveCrowdSpriteMotion(profile.periodMs / 4, 0.5, profile);
    expect(m0.swayRad).not.toBeCloseTo(m1.swayRad, 3);
  });

  test('呼吸は常に 0 以下(上方向)で範囲内', () => {
    const profile = resolveCrowdMotionProfile(0);
    for (let t = 0; t < 8000; t += 211) {
      const m = resolveCrowdSpriteMotion(t, 0.5, profile);
      expect(m.breathe).toBeLessThanOrEqual(1e-9);
      expect(m.breathe).toBeGreaterThanOrEqual(-(profile.breathePx + 1e-9));
    }
  });

  test('不正な時刻でも例外を投げない', () => {
    const profile = resolveCrowdMotionProfile(0.5);
    expect(() => resolveCrowdSpriteMotion(NaN, 0.5, profile)).not.toThrow();
    expect(() => resolveCrowdSpriteMotion(undefined, 0.5, profile)).not.toThrow();
  });
});
