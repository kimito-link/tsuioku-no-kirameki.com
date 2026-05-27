import { describe, it, expect } from 'vitest';
import {
  createTokenBucket,
  refillTokenBucket,
  tryTakeToken
} from './tokenBucket.js';

describe('createTokenBucket', () => {
  it('満タンで開始', () => {
    const b = createTokenBucket(5, 2, 1000);
    expect(b.capacity).toBe(5);
    expect(b.refillPerSec).toBe(2);
    expect(b.tokens).toBe(5);
    expect(b.lastRefillMs).toBe(1000);
  });
  it('不正値は安全な既定（>=1）', () => {
    const b = createTokenBucket(0, -1, 1000);
    expect(b.capacity).toBe(1);
    expect(b.refillPerSec).toBe(1);
  });
});

describe('refillTokenBucket', () => {
  it('経過時間ぶん補充し capacity でクランプ', () => {
    const b = createTokenBucket(5, 2, 0); // 2/sec
    const drained = { ...b, tokens: 0 };
    const r1 = refillTokenBucket(drained, 1000); // 1秒 → +2
    expect(r1.tokens).toBeCloseTo(2, 5);
    const r2 = refillTokenBucket(drained, 10_000); // 10秒 → +20 だが cap=5
    expect(r2.tokens).toBe(5);
  });
  it('経過0なら不変', () => {
    const b = createTokenBucket(5, 2, 1000);
    const drained = { ...b, tokens: 1 };
    const r = refillTokenBucket(drained, 1000);
    expect(r.tokens).toBe(1);
  });
});

describe('tryTakeToken', () => {
  it('トークンあれば取れて減る', () => {
    const b = createTokenBucket(3, 1, 0);
    const r = tryTakeToken(b, 0);
    expect(r.allowed).toBe(true);
    expect(r.state.tokens).toBe(2);
    expect(r.waitMs).toBe(0);
  });

  it('バースト上限まで連続で取れ、その後は拒否＋waitMs', () => {
    const b = createTokenBucket(3, 1, 0); // cap3, 1/sec
    let r = tryTakeToken(b, 0);
    expect(r.allowed).toBe(true); // 3→2
    r = tryTakeToken(r.state, 0);
    expect(r.allowed).toBe(true); // 2→1
    r = tryTakeToken(r.state, 0);
    expect(r.allowed).toBe(true); // 1→0
    r = tryTakeToken(r.state, 0);
    expect(r.allowed).toBe(false); // 0 → 拒否
    expect(r.waitMs).toBe(1000); // 1/sec で1トークン=1000ms
  });

  it('時間が経てば補充され再び取れる', () => {
    const b = createTokenBucket(1, 1, 0);
    let r = tryTakeToken(b, 0);
    expect(r.allowed).toBe(true); // 1→0
    r = tryTakeToken(r.state, 500); // 0.5秒 → +0.5 < 1 → 拒否
    expect(r.allowed).toBe(false);
    r = tryTakeToken(r.state, 1000); // 1秒経過 → +1 → 取れる
    expect(r.allowed).toBe(true);
  });

  it('7タブ分のバーストでもグローバルにバケットで平滑化（cap 超は拒否）', () => {
    // capacity=2, refill 0.5/sec で、7 連続要求のうち取れるのは最初の2つだけ
    const b = createTokenBucket(2, 0.5, 0);
    const allowed = [];
    let st = b;
    for (let i = 0; i < 7; i += 1) {
      const r = tryTakeToken(st, 0);
      allowed.push(r.allowed);
      st = r.state;
    }
    expect(allowed.filter(Boolean).length).toBe(2); // バースト cap=2 だけ通る
  });
});
