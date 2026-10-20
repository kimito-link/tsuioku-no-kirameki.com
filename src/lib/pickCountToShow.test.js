import { describe, expect, it } from 'vitest';
import { pickCountToShow } from './pickCountToShow.js';

describe('pickCountToShow: 見出しの記録件数は、サマリ(正本)を使い、表示用の配列の長さを混ぜない', () => {
  it('サマリがあるなら、配列が長くてもサマリを使う(配列に引っ張られない)', () => {
    expect(pickCountToShow(120, 400)).toBe(120);
  });

  it('サマリが配列より大きいときも、サマリを使う', () => {
    expect(pickCountToShow(6309, 25)).toBe(6309);
  });

  it('サマリが無い(null/undefined)ときだけ、配列の長さへ落とす', () => {
    expect(pickCountToShow(null, 25)).toBe(25);
    expect(pickCountToShow(undefined, 7)).toBe(7);
  });

  it('サマリが 0 以下・不正なら未取得とみなし、0 に潰さず配列の長さを使う', () => {
    expect(pickCountToShow(0, 25)).toBe(25);
    expect(pickCountToShow(-3, 25)).toBe(25);
    expect(pickCountToShow(Number.NaN, 25)).toBe(25);
  });

  it('どちらも無ければ 0', () => {
    expect(pickCountToShow(null, 0)).toBe(0);
    expect(pickCountToShow(0, 0)).toBe(0);
  });

  it('小数は切り捨てる・配列の長さが不正でも落ちない', () => {
    expect(pickCountToShow(12.9, 3)).toBe(12);
    expect(pickCountToShow(null, /** @type {any} */ (undefined))).toBe(0);
  });
});
