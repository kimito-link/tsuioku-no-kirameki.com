import { describe, expect, it } from 'vitest';
import {
  bucketVenueLaneSeats,
  flattenVenueLaneBuckets,
  venueSeatEntryToLaneItem
} from './venueLaneBuckets.js';

function seat(seatIndex, userId, name, avatar = '', extra = {}) {
  return {
    seatIndex,
    participant: {
      key: `u:${userId}`,
      userId,
      name,
      avatar,
      lastAt: 1000 + seatIndex,
      ...extra
    },
    venueRank: extra.venueRank || 0
  };
}

describe('venueSeatEntryToLaneItem', () => {
  it('会場 participant を人物タイル用 item に写す', () => {
    const item = venueSeatEntryToLaneItem(
      seat(2, '12345', '太郎', 'https://cdn.example/12345.jpg', { venueRank: 1 })
    );

    expect(item?.entry.userId).toBe('12345');
    expect(item?.title).toBe('太郎');
    expect(item?.profileTier).toBe(3);
    expect(item?._venueSeatIndex).toBe(2);
    expect(item?._venueParticipantKey).toBe('u:12345');
  });

  it('配信者ID未確定ケースでも数値ID候補を落とさない', () => {
    const item = venueSeatEntryToLaneItem(seat(0, '67890', '', ''));

    expect(item).not.toBeNull();
    expect(item?.entry.userId).toBe('67890');
    expect(item?.profileTier).toBeGreaterThanOrEqual(2);
  });

  it('匿名IDはたぬ姉段へ落とし、identicon を持たせる', () => {
    const item = venueSeatEntryToLaneItem(seat(3, 'a:anon-1', '', ''));

    expect(item?.profileTier).toBe(1);
    expect(item?.displaySrc).toMatch(/^data:image\/svg\+xml/);
    expect(item?.meta.idLine).not.toBe('');
  });
});

describe('bucketVenueLaneSeats', () => {
  it('popup と同じ比較器順で link/konta/tanu に分ける', () => {
    const buckets = bucketVenueLaneSeats([
      seat(0, 'a:1', '', ''),
      seat(1, '22222', '', ''),
      seat(2, '11111', '強い名前', 'https://cdn.example/11111.jpg')
    ]);

    expect(buckets.link.map((x) => x.entry.userId)).toEqual(['11111']);
    expect(buckets.konta.map((x) => x.entry.userId)).toEqual(['22222']);
    expect(buckets.tanu.map((x) => x.entry.userId)).toEqual(['a:1']);
  });

  it('maxTotal は5段合計の上限として効く', () => {
    const buckets = bucketVenueLaneSeats(
      [
        seat(0, '11111', 'A', 'https://cdn.example/1.jpg'),
        seat(1, '22222', 'B', 'https://cdn.example/2.jpg'),
        seat(2, '33333', '', ''),
        seat(3, 'a:1', '', '')
      ],
      { maxTotal: 2 }
    );

    expect(flattenVenueLaneBuckets(buckets).map((x) => x.entry.userId)).toEqual(['11111', '22222']);
  });

  it('flatten は画面表示順を返す', () => {
    const buckets = {
      link: [{ id: 'link' }],
      gift: [{ id: 'gift' }],
      ad: [{ id: 'ad' }],
      konta: [{ id: 'konta' }],
      tanu: [{ id: 'tanu' }]
    };

    expect(flattenVenueLaneBuckets(buckets).map((x) => x.id)).toEqual([
      'link',
      'gift',
      'ad',
      'konta',
      'tanu'
    ]);
  });
});
