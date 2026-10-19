import { describe, expect, it } from 'vitest';
import { canAppendStoryGrowthCells } from './storyGrowthAppendPlan.js';

const ok = { renderedCount: 25, targetCount: 26, domCount: 25, sourceOffset: 0 };

describe('canAppendStoryGrowthCells', () => {
  it('★描いてあり・増えるだけで・数が一致・窓が先頭なら、足してよい', () => {
    expect(canAppendStoryGrowthCells(ok)).toBe(true);
    expect(canAppendStoryGrowthCells({ ...ok, targetCount: 360 })).toBe(true);
  });
  it('★初回(1枚も描いていない)は全部作る', () => {
    expect(canAppendStoryGrowthCells({ ...ok, renderedCount: 0, domCount: 0 })).toBe(false);
  });
  it('★増えない・減るときは足さない(縮小は作り直し)', () => {
    expect(canAppendStoryGrowthCells({ ...ok, targetCount: 25 })).toBe(false);
    expect(canAppendStoryGrowthCells({ ...ok, targetCount: 10 })).toBe(false);
  });
  it('★画面の枚数が描いた数とずれていたら、信用せず作り直す', () => {
    expect(canAppendStoryGrowthCells({ ...ok, domCount: 24 })).toBe(false);
    expect(canAppendStoryGrowthCells({ ...ok, domCount: 0 })).toBe(false);
  });
  it('★窓がスライドしている(先頭が0でない)ときは作り直す', () => {
    expect(canAppendStoryGrowthCells({ ...ok, sourceOffset: 5 })).toBe(false);
  });
  it('壊れた入力は足さない(安全側)', () => {
    expect(canAppendStoryGrowthCells(null)).toBe(false);
    expect(canAppendStoryGrowthCells(undefined)).toBe(false);
    expect(canAppendStoryGrowthCells({})).toBe(false);
    expect(canAppendStoryGrowthCells({ ...ok, domCount: NaN })).toBe(false);
    expect(canAppendStoryGrowthCells({ ...ok, renderedCount: undefined })).toBe(false);
  });
});
