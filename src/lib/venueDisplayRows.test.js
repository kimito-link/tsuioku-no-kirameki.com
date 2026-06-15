import { describe, test, expect } from 'vitest';
import { resolveDisplayRows } from './venueDisplayRows.js';

/**
 * 会場の表示行を「新鮮データ優先・空なら前回保持」で決める純関数の不変条件(invariant)。
 * 根底の根治: 一度非空になったら、集計が一瞬0件/失敗で来ても会場を空で再描画しない。
 */
const row = (uid) => ({ userId: String(uid), name: `u${uid}`, capturedAt: uid });

describe('resolveDisplayRows (前状態保持=空再描画の根絶)', () => {
  test('INV-1: lastGood が非空のとき incoming が空でも lastGood を返す(空にしない)', () => {
    const lastGood = [row(1), row(2)];
    const r = resolveDisplayRows([], lastGood);
    expect(r.rows).toEqual(lastGood);
    expect(r.nextLastGood).toEqual(lastGood);
    expect(r.usedFallback).toBe(true);
  });

  test('INV-2: incoming が非空なら incoming を採用し lastGood を更新する(古いデータに固着しない)', () => {
    const lastGood = [row(1)];
    const incoming = [row(2), row(3)];
    const r = resolveDisplayRows(incoming, lastGood);
    expect(r.rows).toEqual(incoming);
    expect(r.nextLastGood).toEqual(incoming);
    expect(r.usedFallback).toBe(false);
  });

  test('両方空なら空を返す(初回・本当に誰も居ない)', () => {
    const r = resolveDisplayRows([], []);
    expect(r.rows).toEqual([]);
    expect(r.nextLastGood).toEqual([]);
    expect(r.usedFallback).toBe(false);
  });

  test('初回 incoming 非空: lastGood が空でもそのまま採用', () => {
    const incoming = [row(1)];
    const r = resolveDisplayRows(incoming, []);
    expect(r.rows).toEqual(incoming);
    expect(r.nextLastGood).toEqual(incoming);
    expect(r.usedFallback).toBe(false);
  });

  test('入力配列を破壊的に変更しない(参照純度)', () => {
    const lastGood = [row(1), row(2)];
    const lastGoodCopy = lastGood.map((r) => ({ ...r }));
    const incoming = [];
    resolveDisplayRows(incoming, lastGood);
    expect(lastGood).toEqual(lastGoodCopy); // lastGood は変わらない
    expect(incoming).toEqual([]); // incoming も変わらない
  });

  test('不正入力(null/undefined)で例外を投げず空扱い', () => {
    expect(() => resolveDisplayRows(null, null)).not.toThrow();
    const r = resolveDisplayRows(undefined, undefined);
    expect(r.rows).toEqual([]);
    expect(r.usedFallback).toBe(false);
  });

  test('incoming が非配列・lastGood が非空: lastGood を保持(空扱いの incoming に潰されない)', () => {
    const lastGood = [row(5)];
    const r = resolveDisplayRows(undefined, lastGood);
    expect(r.rows).toEqual(lastGood);
    expect(r.usedFallback).toBe(true);
  });
});
