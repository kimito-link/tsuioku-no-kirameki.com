import { describe, it, expect } from 'vitest';
import {
  normalizeBandScale, stepBandScale, applyBandScale, formatBandScale,
  DEFAULT_BAND_SCALE, MIN_BAND_SCALE, MAX_BAND_SCALE, BAND_SCALE_STEPS
} from './bandScale.js';

function fakeDoc() {
  const props = new Map();
  return {
    documentElement: {
      style: {
        setProperty(k, v) { props.set(k, v); },
        removeProperty(k) { props.delete(k); }
      }
    },
    _props: props
  };
}

describe('bandScale', () => {
  it('★既定は等倍ではない(設定に気づかない人にも効く)', () => {
    expect(DEFAULT_BAND_SCALE).toBeGreaterThan(1);
    expect(normalizeBandScale(undefined)).toBe(DEFAULT_BAND_SCALE);
    expect(normalizeBandScale(null)).toBe(DEFAULT_BAND_SCALE);
    expect(normalizeBandScale('こわれた値')).toBe(DEFAULT_BAND_SCALE);
  });

  it('★1.0未満にはできない(小さすぎる実害の方が大きい)', () => {
    expect(normalizeBandScale(0.5)).toBe(MIN_BAND_SCALE);
    expect(normalizeBandScale(-3)).toBe(MIN_BAND_SCALE);
  });

  it('上限を超えない', () => {
    expect(normalizeBandScale(99)).toBe(MAX_BAND_SCALE);
  });

  it('中途半端な値は最寄りの段に丸める', () => {
    expect(BAND_SCALE_STEPS).toContain(normalizeBandScale(1.27));
    expect(normalizeBandScale(1.27)).toBe(1.2);
  });

  it('段送りは端で止まる', () => {
    expect(stepBandScale(MAX_BAND_SCALE, 1)).toBe(MAX_BAND_SCALE);
    expect(stepBandScale(MIN_BAND_SCALE, -1)).toBe(MIN_BAND_SCALE);
    expect(stepBandScale(1.6, 1)).toBe(1.8);
    expect(stepBandScale(1.6, -1)).toBe(1.4);
  });

  it('CSS 変数 --nl-band-scale を書く(zoom は使わない=情報量を減らさない)', () => {
    const d = fakeDoc();
    expect(applyBandScale(d, 1.4)).toBe(1.4);
    expect(d._props.get('--nl-band-scale')).toBe('1.4');
    expect(d._props.has('zoom')).toBe(false);
  });

  it('等倍でも変数は書く(明示的に1.0=帯だけ元に戻せる)', () => {
    const d = fakeDoc();
    expect(applyBandScale(d, 1.0)).toBe(1);
    expect(d._props.get('--nl-band-scale')).toBe('1');
  });

  it('doc が無くても落ちない(会場/コメビュで DOM が未構築でも画面を止めない)', () => {
    expect(() => applyBandScale(null, 1.4)).not.toThrow();
    expect(applyBandScale(null, 1.4)).toBe(1.4);
  });

  it('表示ラベルは百分率', () => {
    expect(formatBandScale(1.6)).toBe('160%');
    expect(formatBandScale(2.4)).toBe('240%');
  });
});
