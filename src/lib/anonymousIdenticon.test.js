import { describe, it, expect } from 'vitest';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

describe('anonymousIdenticonDataUrl', () => {
  it('空・空白 userId は空文字', () => {
    expect(anonymousIdenticonDataUrl('')).toBe('');
    expect(anonymousIdenticonDataUrl('   ')).toBe('');
    expect(anonymousIdenticonDataUrl(null)).toBe('');
  });

  it('data:image/svg+xml の data URL を返す', () => {
    const u = anonymousIdenticonDataUrl('a:deadbeef');
    expect(u).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('同一 userId は同一文字列', () => {
    const a = anonymousIdenticonDataUrl('a:deadbeef');
    const b = anonymousIdenticonDataUrl('a:deadbeef');
    expect(a).toBe(b);
  });

  it('異なる userId は通常は異なる', () => {
    const a = anonymousIdenticonDataUrl('a:one');
    const b = anonymousIdenticonDataUrl('a:two');
    expect(a).not.toBe(b);
  });

  it('sizePx を 16〜128 にクランプ', () => {
    const small = anonymousIdenticonDataUrl('a:x', 8);
    const big = anonymousIdenticonDataUrl('a:x', 999);
    expect(decodeURIComponent(small.split(',')[1])).toContain('viewBox="0 0 16 16"');
    expect(decodeURIComponent(big.split(',')[1])).toContain('viewBox="0 0 128 128"');
  });

  it('既定サイズは 64', () => {
    const u = anonymousIdenticonDataUrl('a:z');
    expect(decodeURIComponent(u.split(',')[1])).toContain('viewBox="0 0 64 64"');
  });
});
