import { describe, it, expect } from 'vitest';
import { isCatchingUp, anyCatchingUp } from './catchingUpVerdict.js';

describe('isCatchingUp — 「まだ取り込み途中か」', () => {
  it('★記録0件でも、放送中で率100%未満なら追いつき中', () => {
    // ★実損の核心(2026-08-22): ここが false だったせいで
    //   「取得率が下がり続けています(100%→0%)」の偽陽性が出た。
    expect(isCatchingUp({ recordedCount: 0, officialCount: 1029 })).toBe(true);
  });

  it('追いつき中(30%)は true', () => {
    expect(isCatchingUp({ recordedCount: 304, officialCount: 1029 })).toBe(true);
  });

  it('取り切った(100%)は false', () => {
    expect(isCatchingUp({ recordedCount: 1029, officialCount: 1029 })).toBe(false);
  });

  it('★終了済みは false(もう増えない)', () => {
    expect(isCatchingUp({ endedAt: 1787363802058, recordedCount: 10, officialCount: 1029 })).toBe(false);
  });

  it('★公式がまだ分からないうちは true(警告を抑止する側へ倒す)', () => {
    expect(isCatchingUp({ recordedCount: 0, officialCount: 0 })).toBe(true);
    expect(isCatchingUp({ recordedCount: 0 })).toBe(true);
    expect(isCatchingUp({})).toBe(true);
  });

  it('壊れた入力でも落ちない', () => {
    expect(isCatchingUp(null)).toBe(true);
    expect(isCatchingUp({ recordedCount: 'x', officialCount: 'y' })).toBe(true);
  });
});

describe('anyCatchingUp — 1つでも追いつき中があるか', () => {
  it('全部取り切っていれば false', () => {
    expect(anyCatchingUp([
      { recordedCount: 100, officialCount: 100 },
      { endedAt: 1, recordedCount: 5, officialCount: 50 }
    ])).toBe(false);
  });

  it('★1つでも追いつき中なら true', () => {
    expect(anyCatchingUp([
      { recordedCount: 100, officialCount: 100 },
      { recordedCount: 0, officialCount: 1029 }
    ])).toBe(true);
  });

  it('空・壊れた入力は false', () => {
    expect(anyCatchingUp([])).toBe(false);
    expect(anyCatchingUp(null)).toBe(false);
  });
});
