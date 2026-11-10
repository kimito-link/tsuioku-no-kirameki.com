import { describe, it, expect } from 'vitest';
import { createShortLivedMemo } from './shortLivedMemo.js';

describe('createShortLivedMemo(0.1.1961: 描き直し1回の中の同じタブ問い合わせを1回に)', () => {
  it('ttl の間の同じ引数は1回だけ問い合わせる(待っている間の重複もまとめる)', async () => {
    let t = 0;
    let n = 0;
    const m = createShortLivedMemo(async (k) => { n += 1; return [k, n]; }, { ttlMs: 400, now: () => t });
    const [a, b] = await Promise.all([m.get('x'), m.get('x')]);
    t = 399;
    const c = await m.get('x');
    expect(n).toBe(1);
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(m.stats()).toEqual({ calls: 3, hits: 2 });
  });
  it('ttl を過ぎたら問い合わせ直す', async () => {
    let t = 0;
    let n = 0;
    const m = createShortLivedMemo(async () => ++n, { ttlMs: 400, now: () => t });
    await m.get('');
    t = 400;
    expect(await m.get('')).toBe(2);
  });
  it('引数が違えば別に問い合わせる', async () => {
    let n = 0;
    const m = createShortLivedMemo(async () => ++n, { ttlMs: 400, now: () => 0 });
    await m.get('a');
    await m.get('b');
    expect(n).toBe(2);
  });
  it('clear で捨てる(タブが動いたとき)', async () => {
    let n = 0;
    const m = createShortLivedMemo(async () => ++n, { ttlMs: 400, now: () => 0 });
    await m.get('');
    m.clear();
    expect(await m.get('')).toBe(2);
  });
  it('失敗した答えは使い回さない', async () => {
    let n = 0;
    const m = createShortLivedMemo(async () => { n += 1; if (n === 1) throw new Error('x'); return n; }, { ttlMs: 400, now: () => 0 });
    await expect(m.get('')).rejects.toThrow('x');
    expect(await m.get('')).toBe(2);
  });
});
