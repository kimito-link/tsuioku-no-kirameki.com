import { describe, it, expect } from 'vitest';
import { countUniqueAvatarEntries } from './avatarEntryCounts.js';
import { avatarCompareKey } from './avatarUrlCompare.js';

describe('countUniqueAvatarEntries', () => {
  it('一意なアバター URL の数を数える', () => {
    const entries = [
      { avatarUrl: 'https://example.com/a.jpg' },
      { avatarUrl: 'https://example.com/b.jpg' },
      { avatarUrl: 'https://example.com/c.jpg' }
    ];
    expect(countUniqueAvatarEntries(entries)).toBe(3);
  });

  it('同一実体を指す URL は 1 つに畳む(avatarCompareKey で正規化)', () => {
    const u = 'https://example.com/a.jpg';
    // 同じ URL を複数回 → 1。avatarCompareKey が同値判定する前提を明示。
    expect(avatarCompareKey(u)).toBe(avatarCompareKey(u));
    const entries = [{ avatarUrl: u }, { avatarUrl: u }, { avatarUrl: u }];
    expect(countUniqueAvatarEntries(entries)).toBe(1);
  });

  it('空/欠落 avatarUrl は数えない', () => {
    const entries = [
      { avatarUrl: '' },
      { avatarUrl: '   ' },
      {},
      { avatarUrl: 'https://example.com/a.jpg' }
    ];
    expect(countUniqueAvatarEntries(entries)).toBe(1);
  });

  it('空配列・null・undefined は 0(投げない)', () => {
    expect(countUniqueAvatarEntries([])).toBe(0);
    expect(countUniqueAvatarEntries(null)).toBe(0);
    expect(countUniqueAvatarEntries(undefined)).toBe(0);
  });

  // ネガティブコントロール: 退化(常に entries.length を返す/常に 0/1)を検知。
  it('ネガコン: 重複ありでも全件数を返さない(length 退化を検知)', () => {
    const u = 'https://example.com/same.jpg';
    const entries = [{ avatarUrl: u }, { avatarUrl: u }];
    expect(countUniqueAvatarEntries(entries)).toBe(1);
    expect(countUniqueAvatarEntries(entries)).not.toBe(entries.length);
  });

  it('ネガコン: 一意な入力では件数に追従する(常に1退化を検知)', () => {
    expect(countUniqueAvatarEntries([{ avatarUrl: 'https://x/1.jpg' }])).toBe(1);
    expect(
      countUniqueAvatarEntries([{ avatarUrl: 'https://x/1.jpg' }, { avatarUrl: 'https://x/2.jpg' }])
    ).toBe(2);
  });
});
