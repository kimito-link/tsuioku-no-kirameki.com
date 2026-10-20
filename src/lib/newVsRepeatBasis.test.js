import { describe, expect, it } from 'vitest';
import { judgeNewVsRepeatBasis } from './newVsRepeatBasis.js';

describe('judgeNewVsRepeatBasis: 過去の配信を読んでいないときは「新規100%」を出さない', () => {
  it('過去の配信が1枠以上あれば、新規/リピーター/ヘビー常連を出してよい', () => {
    expect(judgeNewVsRepeatBasis(1)).toEqual({ ok: true, note: '' });
    expect(judgeNewVsRepeatBasis(8).ok).toBe(true);
  });

  it('過去の配信が0枠(読んでいない)なら、出さない。理由の注記を返す(全員が「新規」に化けるため)', () => {
    const r = judgeNewVsRepeatBasis(0);
    expect(r.ok).toBe(false);
    expect(r.note).toContain('過去の配信を読み込んでいない');
    expect(r.note).toContain('未集計');
  });

  it('不正な値(null・NaN・負)は、読んでいないものとして扱う(出さない側に倒す)', () => {
    for (const v of [null, undefined, Number.NaN, -1, '0']) {
      expect(judgeNewVsRepeatBasis(/** @type {any} */ (v)).ok).toBe(false);
    }
    expect(judgeNewVsRepeatBasis(/** @type {any} */ ('3')).ok).toBe(true);
  });
});
