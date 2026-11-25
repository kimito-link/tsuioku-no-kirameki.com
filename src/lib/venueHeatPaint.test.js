import { describe, expect, it } from 'vitest';
import {
  buildVenueHeatPaint,
  heatLevelToGlowOpacity,
  heatLevelToLabel,
  heatLevelToWarmColor,
  quantizeVenueHeatLevel,
  VENUE_HEAT_LEVEL_STEP
} from './venueHeat.js';

describe('venueHeat: 見た目で区別できない熱量の差では stage を書き直さない(v0.1.2212)', () => {
  it('0.05 刻み(21段)に丸め、0..1 に収める', () => {
    expect(VENUE_HEAT_LEVEL_STEP).toBe(0.05);
    expect(quantizeVenueHeatLevel(0)).toBe(0);
    expect(quantizeVenueHeatLevel(1)).toBe(1);
    expect(quantizeVenueHeatLevel(0.4212)).toBe(0.4);
    expect(quantizeVenueHeatLevel(0.4251)).toBe(0.45);
    expect(quantizeVenueHeatLevel(-3)).toBe(0);
    expect(quantizeVenueHeatLevel(7)).toBe(1);
    expect(quantizeVenueHeatLevel(NaN)).toBe(0);
    const seen = new Set();
    for (let i = 0; i <= 1000; i += 1) seen.add(quantizeVenueHeatLevel(i / 1000));
    expect(seen.size).toBe(21);
  });

  it('コメントが流れて熱量が少しずつ揺れても、同じ段の間は sig が変わらない(=書かない)', () => {
    const a = buildVenueHeatPaint(0.4012);
    const b = buildVenueHeatPaint(0.4187);
    const c = buildVenueHeatPaint(0.3834567);
    expect(a.sig).toBe(b.sig);
    expect(a.sig).toBe(c.sig);
    expect(buildVenueHeatPaint(0.47).sig).not.toBe(a.sig);
  });

  it('色・不透明度・ことばは従来の関数を丸めた熱量に当てたもの(見た目の式は変えない)', () => {
    const p = buildVenueHeatPaint(0.73);
    expect(p.level).toBe(0.75);
    expect(p.color).toBe(heatLevelToWarmColor(0.75));
    expect(Number(p.opacity)).toBeCloseTo(heatLevelToGlowOpacity(0.75), 3);
    expect(p.label).toBe(heatLevelToLabel(0.75));
    // 端は従来と同じ値
    expect(buildVenueHeatPaint(0).color).toBe(heatLevelToWarmColor(0));
    expect(buildVenueHeatPaint(1).color).toBe(heatLevelToWarmColor(1));
    expect(Number(buildVenueHeatPaint(0).opacity)).toBeCloseTo(0.06, 6);
    expect(Number(buildVenueHeatPaint(1).opacity)).toBeCloseTo(0.34, 6);
  });

  it('丸めによる色のずれは1段の半分以内(最大でも各色 ±5 程度)', () => {
    for (let i = 0; i <= 100; i += 1) {
      const raw = i / 100;
      const parse = (/** @type {string} */ s) => s.match(/\d+/g).map(Number);
      const exact = parse(heatLevelToWarmColor(raw));
      const got = parse(buildVenueHeatPaint(raw).color);
      for (let k = 0; k < 3; k += 1) expect(Math.abs(exact[k] - got[k])).toBeLessThanOrEqual(5);
    }
  });
});
