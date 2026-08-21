import { describe, it, expect } from 'vitest';
import {
  ABSENT,
  UNKNOWN,
  PRESENT,
  classifyEmpty,
  classifyComparability,
  isEffectivelyZero
} from './unknownVsAbsent.js';

describe('classifyEmpty — ★「無い」と「まだ分からない」を混ぜない', () => {
  it('値があれば present', () => {
    const r = classifyEmpty({ value: 42, measured: true });
    expect(r.kind).toBe(PRESENT);
    expect(r.comparable).toBe(true);
  });

  it('★測った上での 0 は absent(通してよい)', () => {
    const r = classifyEmpty({ value: 0, measured: true, reason: '対象外' });
    expect(r.kind).toBe(ABSENT);
    expect(r.comparable).toBe(true);
  });

  it('★測っていない 0 は unknown(通してはいけない)', () => {
    const r = classifyEmpty({ value: 0, measured: false });
    expect(r.kind).toBe(UNKNOWN);
    expect(r.comparable).toBe(false);
  });

  it('★measured を省略したら unknown に倒れる(fail-closed)', () => {
    // ★「測ったか」を書かない限り「無い」とは名乗れない、という強制。
    expect(classifyEmpty({ value: 0 }).kind).toBe(UNKNOWN);
    expect(classifyEmpty({ value: null }).kind).toBe(UNKNOWN);
    expect(classifyEmpty({ value: [] }).kind).toBe(UNKNOWN);
  });

  it('★null / undefined / NaN を 0 と同じ扱いにしない(measured なしなら unknown)', () => {
    expect(classifyEmpty({ value: null, measured: false }).kind).toBe(UNKNOWN);
    expect(classifyEmpty({ value: undefined, measured: false }).kind).toBe(UNKNOWN);
    expect(classifyEmpty({ value: NaN, measured: false }).kind).toBe(UNKNOWN);
  });

  it('空配列・空文字も空っぽとして扱う', () => {
    expect(classifyEmpty({ value: [], measured: true }).kind).toBe(ABSENT);
    expect(classifyEmpty({ value: '  ', measured: true }).kind).toBe(ABSENT);
    expect(classifyEmpty({ value: [1], measured: false }).kind).toBe(PRESENT);
  });

  it('入力が壊れていても落ちない', () => {
    expect(classifyEmpty(null).kind).toBe(UNKNOWN);
    expect(classifyEmpty(undefined).kind).toBe(UNKNOWN);
  });
});

describe('classifyComparability — ★別の対象の数字を比べない', () => {
  it('同じIDなら比べてよい', () => {
    const r = classifyComparability({ leftId: 'lv1', rightId: 'lv1', what: 'コメント数' });
    expect(r.comparable).toBe(true);
  });

  it('★IDが違えば比べられない(別配信の値)', () => {
    const r = classifyComparability({ leftId: 'lv1', rightId: 'lv2' });
    expect(r.kind).toBe(UNKNOWN);
    expect(r.comparable).toBe(false);
    expect(r.reason).toContain('別の対象');
  });

  it('★IDが欠けていれば比べられない(分からないので倒す)', () => {
    expect(classifyComparability({ leftId: '', rightId: 'lv1' }).comparable).toBe(false);
    expect(classifyComparability({ leftId: 'lv1' }).comparable).toBe(false);
    expect(classifyComparability({}).comparable).toBe(false);
  });

  it('大文字小文字・前後空白は同一視する', () => {
    expect(classifyComparability({ leftId: ' LV1 ', rightId: 'lv1' }).comparable).toBe(true);
  });
});

describe('isEffectivelyZero — ★丸めをまたいだ厳密比較を避ける', () => {
  it('★既定(0.5)は「四捨五入して 0 になる」範囲', () => {
    // ★2026-08-21 の実損: totalMs===0 が false になり起動直後の門番をすり抜けた。
    //   ★ただし 0.7 は Math.round で 1ms 表示なので、既定では実質ゼロではない。
    //   ★カバー率のような【別の丸め軸】で判定したいときは epsilon を渡すこと
    //     (autoSectionCensus は coveragePct===0 で見る＝表示と一致する軸)。
    expect(isEffectivelyZero(0.4)).toBe(true);
    expect(isEffectivelyZero(0.7)).toBe(false);
    expect(isEffectivelyZero(0.7, 1.7)).toBe(true);
  });

  it('厳密な 0 も実質ゼロ', () => {
    expect(isEffectivelyZero(0)).toBe(true);
  });

  it('1ms 以上は実質ゼロではない', () => {
    expect(isEffectivelyZero(1)).toBe(false);
    expect(isEffectivelyZero(343)).toBe(false);
  });

  it('★測れなかった値(null/NaN)を実質ゼロにしない', () => {
    // ★これを true にすると「測っていない」が「0だった」に化ける。
    expect(isEffectivelyZero(null)).toBe(false);
    expect(isEffectivelyZero(undefined)).toBe(false);
    expect(isEffectivelyZero(NaN)).toBe(false);
    expect(isEffectivelyZero('0')).toBe(false);
  });

  it('しきい値を変えられる', () => {
    expect(isEffectivelyZero(3, 5)).toBe(true);
    expect(isEffectivelyZero(3, 1)).toBe(false);
  });
});
