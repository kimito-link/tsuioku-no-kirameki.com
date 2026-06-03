import { describe, it, expect } from 'vitest';
import {
  countUniqueGiftThrowers,
  countUniqueAdContributors,
  resolveMarketingSupportParticipationCounts
} from './marketingSupportParticipationCounts.js';

describe('marketingSupportParticipationCounts', () => {
  it('数値IDのギフト投げ主を数える', () => {
    const n = countUniqueGiftThrowers(
      [
        { userId: '11111', nickname: 'A' },
        { userId: '22222', nickname: 'B' },
        { userId: 'a:x', nickname: 'anon' }
      ],
      [{ userId: '33333' }]
    );
    expect(n).toBe(3);
  });

  it('広告ランキング行から広告した人を数える', () => {
    const n = countUniqueAdContributors(
      [
        { userId: '99999', nickname: '広告主', contribution: 100 },
        { userId: '88888', nickname: 'B', contribution: 50 }
      ],
      []
    );
    expect(n).toBe(2);
  });

  it('ランキングが空なら広告コメントから数える', () => {
    const n = countUniqueAdContributors(
      [],
      [{ text: '【ニコニ広告】テストさんが100pt広告しました' }]
    );
    expect(n).toBe(1);
  });

  it('resolve が gift/ad 両方返す', () => {
    const r = resolveMarketingSupportParticipationCounts({
      giftUsers: [{ userId: '123456' }],
      adContributionRanking: [{ userId: '678901', contribution: 10 }]
    });
    expect(r.uniqueGiftThrowers).toBe(1);
    expect(r.uniqueAdContributors).toBe(1);
  });
});
