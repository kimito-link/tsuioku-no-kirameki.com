import { describe, it, expect } from 'vitest';
import { ytLeaderboardSig } from './ytLeaderboardSig.js';

describe('ytLeaderboardSig(0.1.1959: 同じ公式ランキングは書き直さない)', () => {
  const a = [{ rank: 1, name: 'A', xp: 100, iconUrl: 'https://x/a.png' }, { rank: 2, name: 'B', xp: 50, iconUrl: '' }];
  it('同じ表なら同じ指紋', () => {
    expect(ytLeaderboardSig(a, 'MONTH')).toBe(ytLeaderboardSig(a.map((r) => ({ ...r })), 'MONTH'));
  });
  it('数・順位・名前・顔・期間のどれかが変われば違う指紋', () => {
    const base = ytLeaderboardSig(a, '');
    expect(ytLeaderboardSig([{ ...a[0], xp: 101 }, a[1]], '')).not.toBe(base);
    expect(ytLeaderboardSig([a[1], a[0]], '')).not.toBe(base);
    expect(ytLeaderboardSig([{ ...a[0], name: 'C' }, a[1]], '')).not.toBe(base);
    expect(ytLeaderboardSig([{ ...a[0], iconUrl: '' }, a[1]], '')).not.toBe(base);
    expect(ytLeaderboardSig(a, 'WEEK')).not.toBe(base);
  });
  it('壊れた行でも投げない', () => {
    expect(() => ytLeaderboardSig([null, 3, { rank: 'x' }])).not.toThrow();
    expect(ytLeaderboardSig(undefined)).toBe(ytLeaderboardSig([]));
  });
});
