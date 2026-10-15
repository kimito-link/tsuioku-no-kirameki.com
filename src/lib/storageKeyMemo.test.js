import { describe, expect, it } from 'vitest';
import { STORAGE_KEY_MEMO_MAX_AGE_MS, createStorageKeyMemo } from './storageKeyMemo.js';

/** 2026-10-16: 巨大なキーを何度も読み直さないための記憶の規則(古い値を出し続けないための4つの備えを固定する)。 */
const KEY = 'nls_user_comment_profile_v1';
const T0 = 1_000_000;

describe('createStorageKeyMemo', () => {
  it('★読み出しの結果を記憶すると、寿命内は fresh・値を返す', () => {
    const m = createStorageKeyMemo(KEY);
    expect(m.isFresh(T0)).toBe(false);
    expect(m.absorbBag({ [KEY]: { a: 1 } }, m.version(), T0)).toBe(true);
    expect(m.isFresh(T0 + 1000)).toBe(true);
    expect(m.get()).toEqual({ a: 1 });
  });
  it('★備え2: 寿命(60秒)を過ぎたら fresh でない=必ず読み直す', () => {
    const m = createStorageKeyMemo(KEY);
    m.absorbBag({ [KEY]: 1 }, m.version(), T0);
    expect(m.isFresh(T0 + STORAGE_KEY_MEMO_MAX_AGE_MS - 1)).toBe(true);
    expect(m.isFresh(T0 + STORAGE_KEY_MEMO_MAX_AGE_MS)).toBe(false);
  });
  it('★備え4: キーが無い結果(失敗の {} など)は記憶しない=以後も読み直す', () => {
    const m = createStorageKeyMemo(KEY);
    expect(m.absorbBag({}, m.version(), T0)).toBe(false);
    expect(m.absorbBag(null, m.version(), T0)).toBe(false);
    expect(m.absorbBag({ other: 1 }, m.version(), T0)).toBe(false);
    expect(m.isFresh(T0)).toBe(false);
  });
  it('★備え1: onChanged の newValue を権威として取り込む(読み直し無しで最新になる)', () => {
    const m = createStorageKeyMemo(KEY);
    m.absorbBag({ [KEY]: 'old' }, m.version(), T0);
    expect(m.onChanged({ [KEY]: { newValue: 'new', oldValue: 'old' } }, 'local', T0 + 5000)).toBe(true);
    expect(m.get()).toBe('new');
    expect(m.isFresh(T0 + 5000)).toBe(true);
  });
  it('★備え1: 削除(newValue 無し)も反映する・別のキー/別の area の変化は無視する', () => {
    const m = createStorageKeyMemo(KEY);
    m.absorbBag({ [KEY]: 'v' }, m.version(), T0);
    expect(m.onChanged({ other: { newValue: 1 } }, 'local', T0)).toBe(false);
    expect(m.onChanged({ [KEY]: { newValue: 'x' } }, 'sync', T0)).toBe(false);
    expect(m.get()).toBe('v');
    expect(m.onChanged({ [KEY]: { oldValue: 'v' } }, 'local', T0)).toBe(true);
    expect(m.get()).toBeUndefined();
    expect(m.isLoaded()).toBe(true);
  });
  it('★備え3: 読み出しの最中に onChanged が来たら、古い読み出し結果で上書きしない', () => {
    const m = createStorageKeyMemo(KEY);
    const v0 = m.version(); // 読み出し開始
    m.onChanged({ [KEY]: { newValue: 'fresh-from-event' } }, 'local', T0 + 10); // 読み出し中に新しい値が届いた
    expect(m.absorbBag({ [KEY]: 'stale-read' }, v0, T0 + 20)).toBe(false);
    expect(m.get()).toBe('fresh-from-event');
  });
  it('invalidate で記憶を捨てる・以後は fresh でない', () => {
    const m = createStorageKeyMemo(KEY);
    m.absorbBag({ [KEY]: 1 }, m.version(), T0);
    m.invalidate();
    expect(m.isFresh(T0)).toBe(false);
    expect(m.get()).toBeUndefined();
  });
  it('時計が巻き戻っても fresh と言わない(負の経過時間)', () => {
    const m = createStorageKeyMemo(KEY);
    m.absorbBag({ [KEY]: 1 }, m.version(), T0);
    expect(m.isFresh(T0 - 1)).toBe(false);
  });
  it('寿命は指定できる', () => {
    const m = createStorageKeyMemo(KEY, { maxAgeMs: 1000 });
    m.absorbBag({ [KEY]: 1 }, m.version(), T0);
    expect(m.isFresh(T0 + 999)).toBe(true);
    expect(m.isFresh(T0 + 1000)).toBe(false);
  });
});
