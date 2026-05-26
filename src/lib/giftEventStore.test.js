import { describe, it, expect } from 'vitest';
import {
  appendGiftEvents,
  buildContributionRankingFromEvents,
  buildGiftHistoryFromEvents,
  summarizeGiftEvents,
  aggregateGiftSenderTotals
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

describe('aggregateGiftSenderTotals', () => {
  it('空配列・非配列は空', () => {
    expect(aggregateGiftSenderTotals([])).toEqual([]);
    expect(aggregateGiftSenderTotals(/** @type {any} */ (null))).toEqual([]);
  });

  it('送信者別に合計pt集計し pt 降順で返す（uid キー）', () => {
    const events = [
      makeEvent({ userId: 'u1', nickname: 'A', point: 100, capturedAt: NOW }),
      makeEvent({ userId: 'u2', nickname: 'B', point: 500, capturedAt: NOW }),
      makeEvent({ userId: 'u1', nickname: 'A', point: 50, capturedAt: NOW + 1 })
    ];
    const r = aggregateGiftSenderTotals(events);
    expect(r.map((x) => [x.userKey, x.totalPoints, x.throwCount])).toEqual([
      ['u2', 500, 1],
      ['u1', 150, 2]
    ]);
    expect(r[1].nickname).toBe('A');
  });

  it('nickname 表記揺れは uid で合算し、表示名は最新 event を採用', () => {
    const events = [
      makeEvent({ userId: 'u1', nickname: '旧名', point: 100, capturedAt: NOW }),
      makeEvent({ userId: 'u1', nickname: '新名', point: 100, capturedAt: NOW + 10 })
    ];
    const r = aggregateGiftSenderTotals(events);
    expect(r).toHaveLength(1);
    expect(r[0].totalPoints).toBe(200);
    expect(r[0].nickname).toBe('新名'); // 最新優先
  });

  it('uid 無しは nickname でバケット、nickname も無ければ「名無し」に集約', () => {
    const events = [
      makeEvent({ userId: '', nickname: 'のっぽ', point: 30, capturedAt: NOW }),
      makeEvent({ userId: '', nickname: 'のっぽ', point: 20, capturedAt: NOW + 1 }),
      makeEvent({ userId: '', nickname: '', point: 10, capturedAt: NOW }),
      makeEvent({ userId: '', nickname: '', point: 5, capturedAt: NOW + 1 })
    ];
    const r = aggregateGiftSenderTotals(events);
    const noppo = r.find((x) => x.nickname === 'のっぽ');
    const nanashi = r.find((x) => x.nickname === '名無し');
    expect(noppo?.totalPoints).toBe(50);
    expect(noppo?.userKey).toBe('__gift_sender_のっぽ'); // uid 無し→合成キー（リンク化されない）
    expect(nanashi?.totalPoints).toBe(15);
    expect(nanashi?.userKey).toBe('__gift_sender_名無し');
    // のっぽ と 名無し は別バケット＝userKey 衝突しない
    expect(noppo?.userKey).not.toBe(nanashi?.userKey);
  });

  it('point 0/欠落は計上(0)だが throwCount は増える（無料ギフト）', () => {
    const events = [
      makeEvent({ userId: 'u1', nickname: 'A', point: 0, capturedAt: NOW }),
      makeEvent({ userId: 'u1', nickname: 'A', point: 100, capturedAt: NOW + 1 }),
      makeEvent({ userId: 'u1', nickname: 'A', point: /** @type {any} */ (undefined), capturedAt: NOW + 2 })
    ];
    const r = aggregateGiftSenderTotals(events);
    expect(r).toHaveLength(1);
    expect(r[0].totalPoints).toBe(100);
    expect(r[0].throwCount).toBe(3);
  });

  it('uid 行は userKey に実 uid を保持（後段でリンク化される）', () => {
    const events = [makeEvent({ userId: '4046119', nickname: 'タロウ', point: 10, capturedAt: NOW })];
    const r = aggregateGiftSenderTotals(events);
    expect(r[0].userKey).toBe('4046119');
    expect(r[0].nickname).toBe('タロウ');
  });

  it('プレースホルダ nick（… のみ等）は空に正規化（表示は u/<uid> へ）', () => {
    const events = [
      makeEvent({ userId: '46650056', nickname: '...', point: 600, capturedAt: NOW })
    ];
    const r = aggregateGiftSenderTotals(events);
    expect(r).toHaveLength(1);
    expect(r[0].nickname).toBe('');
    expect(r[0].totalPoints).toBe(600);
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
