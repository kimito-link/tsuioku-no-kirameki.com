import { describe, expect, it } from 'vitest';
import {
  createStoryGrowthCellSwapState,
  formatStoryGrowthCellSwapLine,
  noteStoryGrowthPatch
} from './storyGrowthCellSwap.js';

/**
 * ユーザー報告(2026-08-01)「積み上げ式にならず、もともと記録されたアイコンがちらちら変わる」。
 *
 * v0.1.1208 の churn 計器は rebuildStoryGrowth(全消し再構築)しか数えておらず
 * 「積み上がりのみ(設計どおり)」と報告した。だが現象の正体は
 * patchStoryGrowthIconsFromSource(DOM枚数は変えず中身だけ上書き)にあり、
 * 窓がずれると既存マスに別人が入る=枚数は不変なので churn には映らない。
 */
describe('noteStoryGrowthPatch', () => {
  it('窓が動かなければ入替0(積み上がりとみなす)', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: 98, offset: 0, atMs: 1 });
    noteStoryGrowthPatch(s, { cells: 98, offset: 0, atMs: 2 });
    expect(s.patches).toBe(2);
    expect(s.cellsPatched).toBe(196);
    expect(s.swaps).toBe(0);
  });

  it('窓が1つずれたら1マスぶん中身が入れ替わったと数える', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: 98, offset: 0, atMs: 1 });
    noteStoryGrowthPatch(s, { cells: 98, offset: 1, atMs: 2 });
    expect(s.swaps).toBe(1);
    expect(s.maxSwapsInOnePatch).toBe(1);
  });

  it('ずれ幅がマス数以上なら全マス総入替として頭打ちにする', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: 98, offset: 0, atMs: 1 });
    noteStoryGrowthPatch(s, { cells: 98, offset: 500, atMs: 2 });
    // 98マスしか無いので、それ以上は入れ替わりようがない
    expect(s.swaps).toBe(98);
    expect(s.maxSwapsInOnePatch).toBe(98);
  });

  it('初回の patch は比較対象が無いので入替に数えない(誤検知しない)', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: 98, offset: 42, atMs: 1 });
    expect(s.swaps).toBe(0);
    expect(s.lastOffset).toBe(42);
  });

  it('窓が戻る向きでも入替として数える(絶対値)', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: 98, offset: 10, atMs: 1 });
    noteStoryGrowthPatch(s, { cells: 98, offset: 7, atMs: 2 });
    expect(s.swaps).toBe(3);
  });

  it('壊れた入力で落ちない・嘘の値を作らない', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: NaN, offset: NaN, atMs: NaN });
    expect(s.patches).toBe(1);
    expect(s.cellsPatched).toBe(0);
    expect(s.swaps).toBe(0);
    expect(() => noteStoryGrowthPatch(null, { cells: 1, offset: 1, atMs: 1 })).not.toThrow();
  });
});

describe('formatStoryGrowthCellSwapLine', () => {
  it('patch が無ければ何も出さない(静かな計器)', () => {
    expect(formatStoryGrowthCellSwapLine(createStoryGrowthCellSwapState())).toBe('');
    expect(formatStoryGrowthCellSwapLine(null)).toBe('');
  });

  it('入替0なら「積み上がり」と明言する', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: 98, offset: 0, atMs: 1 });
    const line = formatStoryGrowthCellSwapLine(s);
    expect(line).toContain('グリッド中身更新 1回');
    expect(line).toContain('中身の入替なし(積み上がり)');
  });

  it('入替があれば「別人にすり替わっている」と名指しする', () => {
    const s = createStoryGrowthCellSwapState();
    noteStoryGrowthPatch(s, { cells: 98, offset: 0, atMs: 1 });
    noteStoryGrowthPatch(s, { cells: 98, offset: 5, atMs: 2 });
    const line = formatStoryGrowthCellSwapLine(s);
    expect(line).toContain('中身の入替5マス');
    expect(line).toContain('すり替わっています');
    expect(line).toContain('最大5マス/回');
  });
});
