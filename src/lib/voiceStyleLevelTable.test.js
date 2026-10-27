import { describe, expect, it } from 'vitest';
import { VOICE_STYLE_LEVEL_TABLE, voiceStyleTableLevel } from './voiceStyleLevelTable.js';

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
});
