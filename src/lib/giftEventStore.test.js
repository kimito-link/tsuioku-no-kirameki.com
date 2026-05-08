import { describe, it, expect } from 'vitest';
import {
  appendGiftEvents,
  buildContributionRankingFromEvents,
  buildGiftHistoryFromEvents,
  summarizeGiftEvents
} from './giftEventStore.js';

const NOW = 1_700_000_000_000;

describe('appendGiftEvents', () => {
  it('appends valid events with capturedAt = now', () => {
    const r = appendGiftEvents(
      [],
      [
        { userId: 'u1', nickname: 'よしださん', itemId: 'stamp_a', point: 100 }
      ],
      NOW
    );
    expect(r.added).toHaveLength(1);
    expect(r.added[0].userId).toBe('u1');
    expect(r.added[0].capturedAt).toBe(NOW);
    expect(r.storageTouched).toBe(true);
    expect(r.next).toHaveLength(1);
  });

  it('returns no-op for empty incoming', () => {
    const existing = [
      {
        userId: 'u1',
        nickname: '',
        itemId: '',
        itemName: '',
        point: 0,
        message: '',
        contributionRank: null,
        capturedAt: NOW - 1000
      }
    ];
    const r = appendGiftEvents(existing, [], NOW);
    expect(r.next).toBe(existing);
    expect(r.added).toEqual([]);
    expect(r.storageTouched).toBe(false);
  });

  it('skips events with no usable fields', () => {
    const r = appendGiftEvents([], [{}, { point: 100 }], NOW);
    expect(r.added).toEqual([]);
    expect(r.storageTouched).toBe(false);
  });

  it('keeps anonymous gift (advertiser_user_id missing) when itemId/itemName present', () => {
    const r = appendGiftEvents(
      [],
      [{ itemId: 'stamp_anon', itemName: 'バスケットボール', point: 100 }],
      NOW
    );
    expect(r.added).toHaveLength(1);
    expect(r.added[0].userId).toBe('');
    expect(r.added[0].itemId).toBe('stamp_anon');
  });

  it('FIFO trims when exceeding maxEvents', () => {
    const existing = [];
    for (let i = 0; i < 10; i++) {
      existing.push({
        userId: `u${i}`,
        nickname: '',
        itemId: '',
        itemName: '',
        point: 0,
        message: '',
        contributionRank: null,
        capturedAt: NOW - 10000 + i
      });
    }
    const r = appendGiftEvents(
      existing,
      [
        { userId: 'new1' },
        { userId: 'new2' }
      ],
      NOW,
      5
    );
    expect(r.next).toHaveLength(5);
    // 古い 7 件は drop され、最新 5 件 (u8, u9, new1, new2 + 1) が残るが順序は append
    expect(r.next[r.next.length - 1].userId).toBe('new2');
    expect(r.next[r.next.length - 2].userId).toBe('new1');
  });

  it('handles non-array existing gracefully', () => {
    const r = appendGiftEvents(null, [{ userId: 'u1' }], NOW);
    expect(r.next).toHaveLength(1);
    expect(r.storageTouched).toBe(true);
  });
});

describe('buildContributionRankingFromEvents', () => {
  it('returns empty array for empty input', () => {
    expect(buildContributionRankingFromEvents([])).toEqual([]);
    expect(buildContributionRankingFromEvents(null)).toEqual([]);
  });

  it('sorts by contributionRank ascending', () => {
    const events = [
      makeEvent({
        userId: 'u3',
        nickname: 'C',
        contributionRank: 3,
        point: 100,
        capturedAt: NOW
      }),
      makeEvent({
        userId: 'u1',
        nickname: 'A',
        contributionRank: 1,
        point: 11000,
        capturedAt: NOW
      }),
      makeEvent({
        userId: 'u2',
        nickname: 'B',
        contributionRank: 2,
        point: 5000,
        capturedAt: NOW
      })
    ];
    const r = buildContributionRankingFromEvents(events);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(r[0].nickname).toBe('A');
    expect(r[0].point).toBe(11000);
  });

  it('keeps latest event per user when ranks repeat', () => {
    const events = [
      makeEvent({
        userId: 'u1',
        nickname: 'old',
        contributionRank: 1,
        point: 100,
        capturedAt: NOW
      }),
      makeEvent({
        userId: 'u1',
        nickname: 'new',
        contributionRank: 1,
        point: 200,
        capturedAt: NOW + 1000
      })
    ];
    const r = buildContributionRankingFromEvents(events);
    expect(r).toHaveLength(1);
    expect(r[0].nickname).toBe('new');
    expect(r[0].point).toBe(200);
  });

  it('skips events without contributionRank', () => {
    const events = [
      makeEvent({ userId: 'u1', contributionRank: null, capturedAt: NOW }),
      makeEvent({ userId: 'u2', contributionRank: 0, capturedAt: NOW }),
      makeEvent({ userId: 'u3', contributionRank: 5, capturedAt: NOW })
    ];
    const r = buildContributionRankingFromEvents(events);
    expect(r).toHaveLength(1);
    expect(r[0].userId).toBe('u3');
  });
});

describe('buildGiftHistoryFromEvents', () => {
  it('returns empty for empty input', () => {
    expect(buildGiftHistoryFromEvents([])).toEqual([]);
    expect(buildGiftHistoryFromEvents(null)).toEqual([]);
  });

  it('returns latest events first, capped at limit', () => {
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push(
        makeEvent({
          userId: `u${i}`,
          nickname: `name${i}`,
          point: i * 100,
          itemName: 'バスケットボール',
          capturedAt: NOW + i
        })
      );
    }
    const r = buildGiftHistoryFromEvents(events, 3);
    expect(r).toHaveLength(3);
    expect(r[0].senderName).toBe('name9');
    expect(r[0].points).toBe(900);
    expect(r[1].senderName).toBe('name8');
    expect(r[2].senderName).toBe('name7');
  });

  it('uses u/<uid> when nickname is empty', () => {
    const events = [
      makeEvent({ userId: 'u123', nickname: '', capturedAt: NOW })
    ];
    const r = buildGiftHistoryFromEvents(events);
    expect(r[0].senderName).toBe('u/u123');
  });

  it('uses 名無し when both nickname and userId are empty', () => {
    const events = [
      makeEvent({ userId: '', nickname: '', itemName: 'x', capturedAt: NOW })
    ];
    const r = buildGiftHistoryFromEvents(events);
    expect(r[0].senderName).toBe('名無し');
  });
});

describe('summarizeGiftEvents', () => {
  it('returns zero summary for empty', () => {
    expect(summarizeGiftEvents([])).toEqual({
      totalEvents: 0,
      totalPoints: 0,
      uniqueSenders: 0
    });
  });

  it('aggregates totalPoints and uniqueSenders', () => {
    const events = [
      makeEvent({ userId: 'u1', point: 100, capturedAt: NOW }),
      makeEvent({ userId: 'u2', point: 200, capturedAt: NOW }),
      makeEvent({ userId: 'u1', point: 50, capturedAt: NOW + 1 })
    ];
    const r = summarizeGiftEvents(events);
    expect(r.totalEvents).toBe(3);
    expect(r.totalPoints).toBe(350);
    expect(r.uniqueSenders).toBe(2);
  });

  it('handles anonymous events (no userId)', () => {
    const events = [
      makeEvent({ userId: '', itemName: 'x', point: 100, capturedAt: NOW })
    ];
    const r = summarizeGiftEvents(events);
    expect(r.totalEvents).toBe(1);
    expect(r.totalPoints).toBe(100);
    expect(r.uniqueSenders).toBe(0);
  });
});

/**
 * @param {Partial<import('./giftEventStore.js').StoredGiftEvent>} overrides
 */
function makeEvent(overrides) {
  return {
    userId: '',
    nickname: '',
    itemId: '',
    itemName: '',
    point: 0,
    message: '',
    contributionRank: null,
    capturedAt: NOW,
    ...overrides
  };
}
