import { describe, expect, it } from 'vitest';
import { VOICE_STYLE_LEVEL_TABLE, VOICE_STYLE_PITCH_RMS_FACTOR, voicePitchRmsFactor, voiceStyleTableLevel } from './voiceStyleLevelTable.js';

describe('voiceStyleLevelTable', () => {
  it('全127声(0〜126)がそろい、値は 0〜1 の範囲', () => {
    expect(Object.keys(VOICE_STYLE_LEVEL_TABLE)).toHaveLength(127);
    for (let id = 0; id <= 126; id++) {
      const lv = voiceStyleTableLevel(id);
      expect(lv).not.toBeNull();
      expect(lv?.rms).toBeGreaterThan(0.03);
      expect(lv?.rms).toBeLessThan(0.15);
      expect(lv?.peak).toBeGreaterThan(0.2);
      expect(lv?.peak).toBeLessThanOrEqual(1);
    }
  });
  it('表に無い声・壊れた styleId は null(呼び出し側は覚えた値か中央値で見積もる)', () => {
    expect(voiceStyleTableLevel(9999)).toBeNull();
    expect(voiceStyleTableLevel(-1)).toBeNull();
    expect(voiceStyleTableLevel('x')).toBeNull();
    expect(voiceStyleTableLevel(undefined)).toBeNull();
  });
  it('v0.1.1793: 声の高さのずらしの倍率は全127声ぶんあり、格子の間は直線で補う', () => {
    expect(Object.keys(VOICE_STYLE_PITCH_RMS_FACTOR)).toHaveLength(127);
    for (const row of Object.values(VOICE_STYLE_PITCH_RMS_FACTOR)) {
      expect(row).toHaveLength(4);
      for (const x of row) { expect(x).toBeGreaterThan(0.3); expect(x).toBeLessThan(2); }
    }
    expect(voicePitchRmsFactor(3, 0)).toBe(1);
    expect(voicePitchRmsFactor(3, -0.06)).toBeCloseTo(VOICE_STYLE_PITCH_RMS_FACTOR['3'][0]);
    expect(voicePitchRmsFactor(3, -0.1)).toBeCloseTo(VOICE_STYLE_PITCH_RMS_FACTOR['3'][0]);
    const mid = (VOICE_STYLE_PITCH_RMS_FACTOR['3'][0] + VOICE_STYLE_PITCH_RMS_FACTOR['3'][1]) / 2;
    expect(voicePitchRmsFactor(3, -0.045)).toBeCloseTo(mid);
    expect(voicePitchRmsFactor(19, -0.06)).toBe(1);
    expect(voicePitchRmsFactor(9999, -0.06)).toBe(1);
    expect(voicePitchRmsFactor(3, 'x')).toBe(1);
    const base = /** @type {any} */ (voiceStyleTableLevel(3));
    const low = /** @type {any} */ (voiceStyleTableLevel(3, -0.06));
    expect(low.rms).toBeCloseTo(base.rms * VOICE_STYLE_PITCH_RMS_FACTOR['3'][0]);
    expect(low.peak).toBeCloseTo(base.peak * VOICE_STYLE_PITCH_RMS_FACTOR['3'][0]);
  });
});
