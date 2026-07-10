import { describe, expect, it } from 'vitest';
import {
  bucketVenueLaneSeats,
  flattenVenueLaneBuckets,
  venueSeatEntryToLaneItem
} from './venueLaneBuckets.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';

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

  // --- v0.1.1117 白円根治(P3): displaySrc は①正本(buildStoryUserLaneCandidateRow)へ委譲 ---
  describe('P3 導出委譲(①とバイト一致)', () => {
    it('数値ID・個人サムネ未取得は①と同一の合成URL(niconicoDefaultUserIconUrl)になる', () => {
      const item = venueSeatEntryToLaneItem(seat(1, '22222', '', ''));
      expect(item?.displaySrc).toBe(niconicoDefaultUserIconUrl('22222'));
      expect(item?.displaySrc).toContain('/usericon/s/2/22222.jpg');
    });

    it('短い数値ID(5桁未満)は旧式の「必ず404の推測URL」を作らない=①と同じく匿名系扱い', () => {
      // 旧実装(deriveNicoUserIconUrl=\\d{2,15}+bucket0許容)は https://…/s/0/1234.jpg を直入れしていた。
      const item = venueSeatEntryToLaneItem(seat(0, '1234', '', ''));
      expect(item?.displaySrc).not.toMatch(/^https?:/);
      expect(item?.displaySrc).toMatch(/^data:image\/svg\+xml/); // ①の匿名系規則=identicon
    });

    it('個人サムネ既知(enrich済み)はそのURLを①と同じガード経路で通す', () => {
      const av = 'https://cdn.example/av/11111.png';
      const item = venueSeatEntryToLaneItem(seat(2, '11111', '太郎', av));
      expect(item?.displaySrc).toBe(av);
    });

    it('characterization: _venueIsVip は旧式のまま(P3で金縁の顔ぶれを変えない)', () => {
      // 数値ID・avatar無し=旧式では推測URLが立つ→VIP true(据え置き)。
      expect(venueSeatEntryToLaneItem(seat(0, '22222', '', ''))?._venueIsVip).toBe(true);
      // 匿名・avatar無し=旧式でも http 無し→VIP false(据え置き)。
      expect(venueSeatEntryToLaneItem(seat(1, 'a:anon-1', '', ''))?._venueIsVip).toBe(false);
    });

    it('pickCtx を渡さなくても崩れない(lib既定=①既定と同値・地雷#3の構造防止)', () => {
      const anon = venueSeatEntryToLaneItem(seat(0, 'a:anon-2', '', ''));
      expect(anon?.displaySrc).toMatch(/^data:image\/svg\+xml/);
      const numeric = venueSeatEntryToLaneItem(seat(1, '333333', '', ''));
      expect(numeric?.displaySrc).toBe(niconicoDefaultUserIconUrl('333333'));
    });
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
