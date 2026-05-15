import { describe, expect, it } from 'vitest';
import { indexOfMaxRectArea } from './inlinePopupHostPrimaryPick.js';

describe('indexOfMaxRectArea', () => {
  it('面積が最大のインデックスを返す', () => {
    expect(
      indexOfMaxRectArea([
        { w: 10, h: 10 },
        { w: 5, h: 5 },
        { w: 4, h: 30 }
      ])
    ).toBe(2);
  });

  it('同面積なら先頭を優先', () => {
    expect(
      indexOfMaxRectArea([
        { w: 10, h: 10 },
        { w: 20, h: 5 },
        { w: 5, h: 20 }
      ])
    ).toBe(0);
  });

  it('空配列は 0', () => {
    expect(indexOfMaxRectArea([])).toBe(0);
  });

  it('負の寸法は 0 扱い', () => {
    expect(
      indexOfMaxRectArea([
        { w: -1, h: 100 },
        { w: 2, h: 2 }
      ])
    ).toBe(1);
  });
});
