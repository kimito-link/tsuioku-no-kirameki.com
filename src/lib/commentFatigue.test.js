import { describe, it, expect } from 'vitest';
import { computeCommentFatigue } from './commentFatigue.js';

const BASE = 1_700_000_000_000;

/** @param {string} uid @param {number} offsetSec */
function c(uid, offsetSec) {
  return { userId: uid, capturedAt: BASE + offsetSec * 1000, text: 'x' };
}

describe('computeCommentFatigue', () => {
  it('空配列で安全に返る', () => {
    const r = computeCommentFatigue([]);
    expect(r.trackedUsers).toBe(0);
    expect(r.analyzedCount).toBe(0);
    expect(r.slowedPct).toBe(0);
    expect(r.tenureBuckets.length).toBe(1);
  });

  it('userId が無い行は追跡対象外（匿名は同一人物として辿れない）', () => {
    const r = computeCommentFatigue([
      { userId: null, capturedAt: BASE, text: 'a' },
      { userId: '', capturedAt: BASE + 1000, text: 'b' }
    ]);
    expect(r.trackedUsers).toBe(0);
  });

  it('配信者は除外する', () => {
    const r = computeCommentFatigue(
      [c('b', 0), c('b', 1), c('b', 2), c('u', 0), c('u', 1), c('u', 2)],
      { broadcasterUserId: 'b' }
    );
    expect(r.trackedUsers).toBe(1);
  });

  it('後半の間隔が広がった人を「失速」と判定する', () => {
    // 前半は 1 秒間隔、後半は 10 秒間隔 → 明確に鈍化
    const ts = [0, 1, 2, 12, 22, 32];
    const r = computeCommentFatigue(ts.map((s) => c('slow', s)));
    expect(r.multiCommenterCount).toBe(1);
    expect(r.analyzedCount).toBe(1);
    expect(r.slowedCount).toBe(1);
    expect(r.slowedPct).toBe(100);
    expect(r.medianSlowdownRatio).toBeGreaterThan(1.2);
  });

  it('等間隔の人は失速扱いにならない', () => {
    const ts = [0, 5, 10, 15, 20, 25];
    const r = computeCommentFatigue(ts.map((s) => c('steady', s)));
    expect(r.analyzedCount).toBe(1);
    expect(r.slowedCount).toBe(0);
    expect(r.medianSlowdownRatio).toBeCloseTo(1, 1);
  });

  it('コメント2件以下はペース鈍化の分析対象外', () => {
    const r = computeCommentFatigue([c('few', 0), c('few', 3)]);
    expect(r.analyzedCount).toBe(0);
  });

  it('在籍時間カーブと残存率を出す', () => {
    // u1: tenure 0,0,1 分 / u2: tenure 0 分のみ
    const r = computeCommentFatigue([
      c('u1', 0),
      c('u1', 10),
      c('u1', 70), // 1分経過
      c('u2', 0),
      c('u2', 20)
    ]);
    expect(r.startUsers).toBe(2);
    // tenure 0 分: u1,u2 の 2 人
    expect(r.tenureBuckets[0].activeUsers).toBe(2);
    expect(r.tenureBuckets[0].retentionPct).toBe(100);
    // tenure 1 分: u1 のみ → 残存 50%
    expect(r.tenureBuckets[1].activeUsers).toBe(1);
    expect(r.tenureBuckets[1].retentionPct).toBe(50);
  });

  it('maxTenureMin を超える経過分はバケツに含めない', () => {
    const r = computeCommentFatigue([c('u', 0), c('u', 60 * 60)], { maxTenureMin: 5 });
    // 60分後のコメントは tenure 5 を超えるので末尾バケツに乗らない（末尾空は trim）
    expect(r.tenureBuckets.length).toBeLessThanOrEqual(6);
    expect(r.tenureBuckets[0].activeUsers).toBe(1);
  });
});
