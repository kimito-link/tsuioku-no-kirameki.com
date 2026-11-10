import { describe, expect, it } from 'vitest';
import { createAppliedEntriesMemo, userCommentProfileMapFingerprint } from './appliedEntriesMemo.js';
import { mergeEntriesIntoUserCommentProfileMap } from './userCommentProfileMerge.js';
import { normalizeStoredCommentEntries } from './storedCommentEntriesNormalize.js';

const T0 = 1_700_000_000_000;
/** @param {number} n @param {number} people */
function rows(n, people) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i % people;
    out.push({ id: `c${i}`, commentNo: String(i + 1), liveId: 'lv1', userId: `u${u}`, nickname: u % 3 === 0 ? '' : `name${u}`, avatarUrl: '', text: `t${i}`, capturedAt: T0 + i });
  }
  return out;
}

describe('userCommentProfileMapFingerprint', () => {
  it('中身が同じなら同じ・1か所でも違えば違う', () => {
    const a = { u1: { updatedAt: 1, nickname: 'a' }, u2: { updatedAt: 2, avatarUrl: 'https://x/y.png' } };
    const b = JSON.parse(JSON.stringify(a));
    expect(userCommentProfileMapFingerprint(a)).toBe(userCommentProfileMapFingerprint(b));
    b.u2.updatedAt = 3;
    expect(userCommentProfileMapFingerprint(a)).not.toBe(userCommentProfileMapFingerprint(b));
    expect(userCommentProfileMapFingerprint({ u1: { updatedAt: 1, nickname: 'ab' } })).not.toBe(
      userCommentProfileMapFingerprint({ u1: { updatedAt: 1, nickname: 'a', avatarUrl: 'b' } })
    );
    expect(userCommentProfileMapFingerprint(null)).toBe('0:0:0');
  });
});

describe('createAppliedEntriesMemo', () => {
  it('ふつうの大きさ(minRows 未満)は毎回そのまま計算する', () => {
    const memo = createAppliedEntriesMemo({ minRows: 100 });
    const arr = rows(10, 3);
    const r1 = memo.merge({}, arr, { nowMs: T0 + 1000 });
    const want = mergeEntriesIntoUserCommentProfileMap({}, arr, { nowMs: T0 + 1000 });
    expect(r1.map).toEqual(want.map);
    expect(r1.arr).toEqual(want.arr);
    expect(memo.normalize(arr)).toEqual(normalizeStoredCommentEntries(arr));
    expect(memo.diag.mergeHits + memo.diag.mergeMisses + memo.diag.normalizeHits + memo.diag.normalizeMisses).toBe(0);
  });

  it('同じ配列・同じ控えなら計算せず、同じ配列を返す(結果は素の計算と同じ)', () => {
    const memo = createAppliedEntriesMemo({ minRows: 5 });
    const arr = rows(60, 7);
    const seed = () => ({ u0: { updatedAt: T0 - 5, nickname: 'zero' }, u3: { updatedAt: T0 - 4, nickname: 'three' } });
    const want = mergeEntriesIntoUserCommentProfileMap(seed(), arr, { nowMs: T0 + 1000 });
    const r1 = memo.merge(seed(), arr, { nowMs: T0 + 1000 });
    const r2 = memo.merge(seed(), arr, { nowMs: T0 + 4000 });
    expect(r1.map).toEqual(want.map);
    expect(r1.arr).toEqual(want.arr);
    expect(r1.commentsPatched).toBe(true);
    expect(r2.arr).toBe(r1.arr);
    expect(r2.map).toEqual(want.map);
    expect(r2.commentsPatched).toBe(want.commentsPatched);
    expect(r2.cacheTouched).toBe(want.cacheTouched);
    expect(memo.diag).toMatchObject({ mergeHits: 1, mergeMisses: 1 });
  });

  it('返した控えを呼び出し側が書き換えても、次の結果は汚れない', () => {
    const memo = createAppliedEntriesMemo({ minRows: 5 });
    const arr = rows(30, 4);
    const r1 = memo.merge({}, arr, { nowMs: T0 + 1000 });
    const clean = JSON.parse(JSON.stringify(r1.map));
    r1.map.u1.nickname = 'こわした';
    r1.map.extra = { updatedAt: 1 };
    const r2 = memo.merge({}, arr, { nowMs: T0 + 2000 });
    expect(r2.map).toEqual(clean);
    r2.map.u2.nickname = 'またこわした';
    expect(memo.merge({}, arr, { nowMs: T0 + 3000 }).map).toEqual(clean);
  });

  it('控えが変わって計算し直しても、行の結果が同じなら前と同じ配列を返す', () => {
    const memo = createAppliedEntriesMemo({ minRows: 5 });
    const arr = rows(60, 7);
    const r1 = memo.merge({ u0: { updatedAt: T0 - 5, nickname: 'zero' } }, arr, { nowMs: T0 + 1000 });
    // 1回目の出力の控えを入力にした2回目(全件読みの続きの回と同じ形)
    const r2 = memo.merge(r1.map, arr, { nowMs: T0 + 1500 });
    expect(memo.diag.mergeMisses).toBe(2);
    expect(r2.arr).toBe(r1.arr);
    expect(memo.diag.mergeArrReused).toBe(1);
  });

  it('控えが変わって行の結果も変わるなら、新しい結果を返す', () => {
    const memo = createAppliedEntriesMemo({ minRows: 5 });
    const arr = rows(60, 7);
    const r1 = memo.merge({ u0: { updatedAt: T0 - 5, nickname: 'zero' } }, arr, { nowMs: T0 + 1000 });
    const r2 = memo.merge({ u0: { updatedAt: T0 - 5, nickname: 'ZERO2' } }, arr, { nowMs: T0 + 1500 });
    const want = mergeEntriesIntoUserCommentProfileMap({ u0: { updatedAt: T0 - 5, nickname: 'ZERO2' } }, arr, { nowMs: T0 + 1500 });
    expect(r2.arr).not.toBe(r1.arr);
    expect(r2.arr).toEqual(want.arr);
  });

  it('別の配列・長さが変わった配列・時間切れは計算し直す', () => {
    const memo = createAppliedEntriesMemo({ minRows: 5, ttlMs: 10_000 });
    const arr = rows(30, 4);
    memo.merge({}, arr, { nowMs: T0 + 1000 });
    memo.merge({}, rows(30, 4), { nowMs: T0 + 1100 });
    expect(memo.diag).toMatchObject({ mergeHits: 0, mergeMisses: 2 });
    memo.merge({}, arr, { nowMs: T0 + 1200 });
    expect(memo.diag.mergeHits).toBe(1);
    memo.merge({}, arr, { nowMs: T0 + 20_000 });
    expect(memo.diag.mergeMisses).toBe(3);
    arr.push({ id: 'x', commentNo: '999', liveId: 'lv1', userId: 'u9', nickname: 'nine', avatarUrl: '', text: 'new', capturedAt: T0 + 999 });
    const r = memo.merge({}, arr, { nowMs: T0 + 20_100 });
    expect(memo.diag.mergeMisses).toBe(4);
    expect(r.map.u9?.nickname).toBe('nine');
  });

  it('正規化: 同じ配列なら前回の結果(同じ配列)を返し、長さが変われば計算し直す', () => {
    const memo = createAppliedEntriesMemo({ minRows: 5 });
    const arr = rows(20, 4);
    arr.push({ ...arr[3] }); // 同じコメントの重複
    const want = normalizeStoredCommentEntries(arr);
    const n1 = memo.normalize(arr);
    const n2 = memo.normalize(arr);
    expect(n1).toEqual(want);
    expect(n2.next).toBe(n1.next);
    expect(n2.changed).toBe(n1.changed);
    expect(memo.diag).toMatchObject({ normalizeHits: 1, normalizeMisses: 1 });
    arr.push({ id: 'y', commentNo: '500', liveId: 'lv1', userId: 'u1', nickname: 'name1', avatarUrl: '', text: 'z', capturedAt: T0 + 500 });
    expect(memo.normalize(arr).next.length).toBe(want.next.length + 1);
    expect(memo.diag.normalizeMisses).toBe(2);
  });
});
