import { describe, it, expect } from 'vitest';
import { enrichmentAvatarWithCanonicalFallback } from './enrichmentAvatarFallback.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';

describe('enrichmentAvatarWithCanonicalFallback', () => {
  it('全ソース空 + 数値ID → canonical URL を返す', () => {
    const uid = '141919418';
    const result = enrichmentAvatarWithCanonicalFallback(uid, '', '', '');
    expect(result).toBe(niconicoDefaultUserIconUrl(uid));
    expect(result).toContain('nicoaccount/usericon');
  });

  it('intercept に実 URL がある場合 → 空を返す（既存ソース優先）', () => {
    expect(
      enrichmentAvatarWithCanonicalFallback(
        '141919418',
        'https://example.com/avatar.jpg',
        '',
        ''
      )
    ).toBe('');
  });

  it('interceptMap に URL がある場合 → 空を返す', () => {
    expect(
      enrichmentAvatarWithCanonicalFallback(
        '141919418',
        '',
        'https://cdn.nico/face.png',
        ''
      )
    ).toBe('');
  });

  it('DOM row に URL がある場合 → 空を返す', () => {
    expect(
      enrichmentAvatarWithCanonicalFallback(
        '141919418',
        '',
        '',
        'https://dom-source/icon.jpg'
      )
    ).toBe('');
  });

  it('匿名 a: 形式の ID → 空（canonical 生成不可）', () => {
    expect(
      enrichmentAvatarWithCanonicalFallback('a:xyzABCDEFG', '', '', '')
    ).toBe('');
  });

  it('ID なし → 空', () => {
    expect(
      enrichmentAvatarWithCanonicalFallback('', '', '', '')
    ).toBe('');
  });

  it('4桁以下の短い数値ID → 空（niconicoDefaultUserIconUrl の対象外）', () => {
    expect(
      enrichmentAvatarWithCanonicalFallback('1234', '', '', '')
    ).toBe('');
  });
});
