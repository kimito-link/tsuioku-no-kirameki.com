import { describe, expect, it } from 'vitest';
import { detectOfficialEventRankChange } from './officialEventRankChange.js';

describe('detectOfficialEventRankChange', () => {
  it('数値が減れば up(順位が上がった)', () => {
    expect(detectOfficialEventRankChange(5, 3)).toBe('up');
  });

  it('数値が増えれば down(順位が下がった)', () => {
    expect(detectOfficialEventRankChange(3, 5)).toBe('down');
  });

  it('変化なしは none', () => {
    expect(detectOfficialEventRankChange(3, 3)).toBe('none');
  });

  it('前回が null(不明)なら none(誤検知しない)', () => {
    expect(detectOfficialEventRankChange(null, 3)).toBe('none');
  });

  it('今回が null(unscrapable)なら none(誤検知しない)', () => {
    expect(detectOfficialEventRankChange(3, null)).toBe('none');
  });

  it('両方 undefined なら none', () => {
    expect(detectOfficialEventRankChange(undefined, undefined)).toBe('none');
  });

  it('0以下の値は無効として none', () => {
    expect(detectOfficialEventRankChange(0, 3)).toBe('none');
    expect(detectOfficialEventRankChange(3, -1)).toBe('none');
  });

  it('NaN は none', () => {
    expect(detectOfficialEventRankChange(NaN, 3)).toBe('none');
  });
});
