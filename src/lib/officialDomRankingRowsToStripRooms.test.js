import { describe, it, expect } from 'vitest';
import { officialDomRankingRowsToStripRooms } from './officialDomRankingRowsToStripRooms.js';

describe('officialDomRankingRowsToStripRooms', () => {
  it('貢献度行を stripRooms 形へ（匿名キーは contrib）', () => {
    const rooms = officialDomRankingRowsToStripRooms(
      [
        { name: 'userA', contribution: 12, thumbnailUrl: 'https://x/a.jpg', isAnonymous: false },
        { name: 'anon', contribution: 3, isAnonymous: true }
      ],
      { userKeyKind: 'contrib' }
    );
    expect(rooms[0].userKey).toMatch(/^__contrib_/);
    expect(rooms[0].nickname).toBe('userA');
    expect(rooms[0].count).toBe(12);
    expect(rooms[0].avatarUrl).toContain('https://');
    expect(rooms[1].userKey).toBe('__anon_contrib_1');
  });

  it('広告行は ad 用 userKey（rank が付いていれば rankHint に写す）', () => {
    const rooms = officialDomRankingRowsToStripRooms(
      [{ name: 'b', contribution: 5, isAnonymous: false, rank: 4 }],
      { userKeyKind: 'ad' }
    );
    expect(rooms[0].userKey).toMatch(/^__ad_/);
    expect(rooms[0].rankHint).toBe(4);
  });

  it('非配列は空', () => {
    expect(officialDomRankingRowsToStripRooms(/** @type {any} */ (null))).toEqual([]);
  });

  it('v0.1.316: 記名行に公式 userPageUrl があれば userKey に実 uid を採用（リンク化経路へ）', () => {
    const rooms = officialDomRankingRowsToStripRooms(
      [
        {
          name: 'タロウ',
          contribution: 100,
          isAnonymous: false,
          userPageUrl: 'https://www.nicovideo.jp/user/4046119'
        },
        { name: 'ジロウ', contribution: 50, isAnonymous: false },
        { name: '名無し', contribution: 10, isAnonymous: true }
      ],
      { userKeyKind: 'contrib' }
    );
    expect(rooms[0].userKey).toBe('4046119');
    expect(rooms[0].nickname).toBe('タロウ');
    expect(rooms[1].userKey).toMatch(/^__contrib_/);
    expect(rooms[2].userKey).toBe('__anon_contrib_2');
  });

  it('v0.1.316: 想定外ホストの userPageUrl は uid 採用しない（合成キーに倒す）', () => {
    const rooms = officialDomRankingRowsToStripRooms(
      [
        {
          name: 'X',
          contribution: 1,
          isAnonymous: false,
          userPageUrl: 'https://evil.example.com/user/999'
        }
      ],
      { userKeyKind: 'contrib' }
    );
    expect(rooms[0].userKey).toMatch(/^__contrib_/);
  });
});
