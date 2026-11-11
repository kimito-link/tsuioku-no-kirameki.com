import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dropPseudoLvCommentWrites } from './ytShimCommentWrites.js';
import { isYtPseudoLvShape } from './ytPseudoLv.js';

const isPseudo = (lv) => lv === 'lv900000001';

describe('dropPseudoLvCommentWrites', () => {
  it('疑似 lv のコメントの控えだけ捨て、ほかは残す', () => {
    const items = { nls_comments_lv900000001: [1, 2, 3], nls_ctail_lv900000001: [3], nls_comments_lv1: [9], other: 1 };
    const r = dropPseudoLvCommentWrites(items, isPseudo);
    expect(r.items).toEqual({ nls_comments_lv1: [9], other: 1 });
    expect(r.dropped).toBe(2);
    expect(items.nls_comments_lv900000001).toEqual([1, 2, 3]); // 元の値は触らない
  });
  it('保存場所の頭(ytm:)が付いていても捨てる', () => {
    expect(dropPseudoLvCommentWrites({ 'ytm:nls_comments_lv900000001': [1] }, isPseudo).dropped).toBe(1);
  });
  it('捨てるものが無ければ同じ値をそのまま返す', () => {
    const items = { nls_comments_lv1: [9] };
    expect(dropPseudoLvCommentWrites(items, isPseudo).items).toBe(items);
    expect(dropPseudoLvCommentWrites(null, isPseudo).dropped).toBe(0);
  });
});

describe('配線(ytNicoShim.js)', () => {
  it('storage.set の入口で疑似 lv のコメントの控えを捨てる', () => {
    const src = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
    const i = src.indexOf('realLocal.set = (');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 1200)).toContain('dropPseudoLvCommentWrites(items');
    expect(src.slice(i, i + 1200)).toContain('isYtPseudoLvShape(lv)');
  });
  it('逆引きが空でも、疑似 lv の形(lv9+11桁)の控えは捨てる', () => {
    const lv = 'lv988799733173';
    expect(isYtPseudoLvShape(lv)).toBe(true);
    expect(isYtPseudoLvShape('lv348012345')).toBe(false);
    const r = dropPseudoLvCommentWrites(
      { [`nls_comments_${lv}`]: [1, 2], [`ytm:nls_ctail_${lv}`]: [2], nls_comments_lv348012345: [9] },
      (id) => isYtPseudoLvShape(id),
    );
    expect(r.dropped).toBe(2);
    expect(r.items).toEqual({ nls_comments_lv348012345: [9] });
  });
});
