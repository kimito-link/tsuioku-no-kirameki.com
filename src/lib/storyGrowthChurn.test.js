import { describe, expect, it } from 'vitest';
import {
  createStoryGrowthChurnState,
  noteStoryGrowthRebuild,
  summarizeStoryGrowthChurn
} from './storyGrowthChurn.js';

/**
 * ユーザー報告(2026-08-01)「増えていく動きならいいけど、そうじゃない」を数字で確かめる計器。
 *
 * 設計は「ぷよぷよのように積み上がる」だが、上限(360)を超えると sourceOffset が
 * 1件ごとに進み、直近360件の窓が丸ごとスライドする=毎回総入替になる、というのが
 * コードから読んだ推論。それが実機で本当に起きているかを測るのがこの計器の役目。
 */
describe('storyGrowthChurn', () => {
  const T0 = 1_700_000_000_000;

  it('未観測のときは嘘の0を出さない', () => {
    const r = summarizeStoryGrowthChurn(createStoryGrowthChurnState(), T0);
    expect(r.rebuilds).toBe(0);
    expect(r.avgMs).toBe(-1);
    expect(r.line).toContain('未観測');
  });

  it('★offsetが進んだ回はスライド、進まない回は増加として分ける(核心)', () => {
    const s = createStoryGrowthChurnState();
    // 上限未満: offset は 0 のまま増えるだけ=積み上がり
    noteStoryGrowthRebuild(s, { cells: 100, offset: 0, atMs: T0 });
    noteStoryGrowthRebuild(s, { cells: 200, offset: 0, atMs: T0 + 1000 });
    // 上限超え: offset が1ずつ進む=窓がスライド
    noteStoryGrowthRebuild(s, { cells: 360, offset: 1, atMs: T0 + 2000 });
    noteStoryGrowthRebuild(s, { cells: 360, offset: 2, atMs: T0 + 3000 });
    const r = summarizeStoryGrowthChurn(s, T0 + 3000);
    expect(r.rebuilds).toBe(4);
    expect(r.slideRebuilds).toBe(2);
    expect(r.growRebuilds).toBe(2);
    expect(r.slideCells).toBe(720); // 360×2枚がスライドで捨てられ描き直された
  });

  it('スライドが半分以上なら「総入替になっている」と名指しする', () => {
    const s = createStoryGrowthChurnState();
    noteStoryGrowthRebuild(s, { cells: 360, offset: 0, atMs: T0 });
    for (let i = 1; i <= 9; i += 1) {
      noteStoryGrowthRebuild(s, { cells: 360, offset: i, atMs: T0 + i * 100 });
    }
    const r = summarizeStoryGrowthChurn(s, T0 + 1000);
    expect(r.slideRebuilds).toBe(9);
    expect(r.line).toContain('スライド支配的');
    expect(r.line).toContain('毎回総入替');
  });

  it('スライドが一度も無ければ「設計どおり」と言う(誤検知しない)', () => {
    const s = createStoryGrowthChurnState();
    noteStoryGrowthRebuild(s, { cells: 50, offset: 0, atMs: T0 });
    noteStoryGrowthRebuild(s, { cells: 120, offset: 0, atMs: T0 + 500 });
    expect(summarizeStoryGrowthChurn(s, T0 + 500).line).toContain('積み上がりのみ');
  });

  it('所要時間は平均と最大を出す(重さの実測)', () => {
    const s = createStoryGrowthChurnState();
    noteStoryGrowthRebuild(s, { cells: 360, offset: 0, atMs: T0, elapsedMs: 10 });
    noteStoryGrowthRebuild(s, { cells: 360, offset: 1, atMs: T0 + 100, elapsedMs: 30 });
    const r = summarizeStoryGrowthChurn(s, T0 + 100);
    expect(r.avgMs).toBe(20);
    expect(r.maxMs).toBe(30);
    expect(r.line).toContain('平均20ms・最大30ms');
  });

  it('elapsedMs が無い呼び出しでも落ちない(時間は出さない)', () => {
    const s = createStoryGrowthChurnState();
    noteStoryGrowthRebuild(s, { cells: 10, offset: 0, atMs: T0 });
    const r = summarizeStoryGrowthChurn(s, T0);
    expect(r.avgMs).toBe(-1);
    expect(r.line).not.toContain('平均');
  });

  it('初回はスライド判定しない(前回offsetが無いため)', () => {
    const s = createStoryGrowthChurnState();
    noteStoryGrowthRebuild(s, { cells: 360, offset: 500, atMs: T0 });
    const r = summarizeStoryGrowthChurn(s, T0);
    expect(r.slideRebuilds).toBe(0);
    expect(r.growRebuilds).toBe(1);
  });

  it('offsetが戻る(配信切替等)ときはスライド扱いにしない', () => {
    const s = createStoryGrowthChurnState();
    noteStoryGrowthRebuild(s, { cells: 360, offset: 100, atMs: T0 });
    noteStoryGrowthRebuild(s, { cells: 360, offset: 0, atMs: T0 + 100 }); // 巻き戻り
    const r = summarizeStoryGrowthChurn(s, T0 + 100);
    expect(r.slideRebuilds).toBe(0);
  });

  it('null/不正入力でも落ちない', () => {
    expect(() => noteStoryGrowthRebuild(null, { cells: 1, offset: 0, atMs: T0 })).not.toThrow();
    expect(() => noteStoryGrowthRebuild(createStoryGrowthChurnState(), null)).not.toThrow();
    expect(summarizeStoryGrowthChurn(null, T0).rebuilds).toBe(0);
  });
});
