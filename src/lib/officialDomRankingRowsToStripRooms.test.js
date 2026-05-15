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
});
