import { describe, it, expect } from 'vitest';
import { computeRecordRate, scoreRecordProgress } from './recordRate.js';

/*
 * 取得スピード(records/sec)の算出と健康スコア化。退行(取得停止)の自動検出。
 * 2026-06-05 ユーザー提案「検証に取得スピードと記録%を入れる」。
 */

describe('computeRecordRate', () => {
  it('10秒で100件増 → 10 records/sec', () => {
    expect(
      computeRecordRate({ prevCount: 0, prevAtMs: 0, curCount: 100, curAtMs: 10000 })
    ).toBe(10);
  });

  it('1秒で2件増 → 2 records/sec', () => {
    expect(
      computeRecordRate({ prevCount: 50, prevAtMs: 1000, curCount: 52, curAtMs: 2000 })
    ).toBe(2);
  });

  it('増えていない → 0(取得停止の検出)', () => {
    expect(
      computeRecordRate({ prevCount: 100, prevAtMs: 0, curCount: 100, curAtMs: 5000 })
    ).toBe(0);
  });

  it('件数が減った(配信切替/再集計) → 0(負レートを出さない)', () => {
    expect(
      computeRecordRate({ prevCount: 200, prevAtMs: 0, curCount: 50, curAtMs: 5000 })
    ).toBe(0);
  });

  it('時刻逆行・同時刻 → null(算出不能)', () => {
    expect(
      computeRecordRate({ prevCount: 0, prevAtMs: 5000, curCount: 100, curAtMs: 5000 })
    ).toBeNull();
    expect(
      computeRecordRate({ prevCount: 0, prevAtMs: 5000, curCount: 100, curAtMs: 1000 })
    ).toBeNull();
  });

  it('引数欠落/非数値 → null', () => {
    expect(computeRecordRate({})).toBeNull();
    expect(computeRecordRate(undefined)).toBeNull();
    expect(computeRecordRate({ prevCount: 0, prevAtMs: 0, curCount: 100 })).toBeNull();
  });
});

describe('scoreRecordProgress', () => {
  it('取得率95%+ はほぼ完走 → rate 低くても満点5(完走を不健康と誤判定しない)', () => {
    expect(scoreRecordProgress({ recordRate: 0, capturePct: 100 })).toBe(5);
    expect(scoreRecordProgress({ recordRate: 0.01, capturePct: 96 })).toBe(5);
  });

  it('🔴退行検出: 取得率低(2.8%)かつ取得停止(rate≈0) → 0(まさに全部とれない退行)', () => {
    expect(scoreRecordProgress({ recordRate: 0, capturePct: 2.8 })).toBe(0);
    expect(scoreRecordProgress({ recordRate: 0.02, capturePct: 9 })).toBe(0);
  });

  it('取得率80%+ で停滞 → 軽症3(完走間際)', () => {
    expect(scoreRecordProgress({ recordRate: 0, capturePct: 85 })).toBe(3);
  });

  it('取得率50%+ で停滞 → 中症2', () => {
    expect(scoreRecordProgress({ recordRate: 0, capturePct: 60 })).toBe(2);
  });

  it('取得が進んでいる(速い) → 高評価', () => {
    expect(scoreRecordProgress({ recordRate: 25, capturePct: 40 })).toBe(5);
    expect(scoreRecordProgress({ recordRate: 10, capturePct: 40 })).toBe(4);
    expect(scoreRecordProgress({ recordRate: 3, capturePct: 40 })).toBe(3);
    expect(scoreRecordProgress({ recordRate: 0.5, capturePct: 40 })).toBe(2);
  });

  it('rate 不明(初回) → 中庸3', () => {
    expect(scoreRecordProgress({ recordRate: null, capturePct: 40 })).toBe(3);
    expect(scoreRecordProgress({})).toBe(3);
  });
});
