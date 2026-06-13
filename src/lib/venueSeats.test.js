import { describe, expect, it } from 'vitest';
import {
  venueParticipantKey,
  collectVenueParticipants,
  countAnonymousParticipants,
  resolveVenueLayoutMode,
  venueRowsFromUserLaneCandidates,
  buildVenueTiers,
  VENUE_FULLSCREEN_MAX_SEATS,
  rankVenueParticipants,
  assignVenueSeats,
  buildVenueSeating,
  VENUE_MAX_SEATS,
  VENUE_FRONT_ROW_SEATS
} from './venueSeats.js';

const isGeneric = (name) => ['匿名', '名無し'].includes(String(name).trim());

describe('venueParticipantKey', () => {
  it('userId を最優先キーにする', () => {
    expect(venueParticipantKey({ userId: '123', name: 'たろう' })).toBe('u:123');
  });
  it('userId 無しは個人名をキーにする', () => {
    expect(venueParticipantKey({ name: 'たろう' })).toBe('n:たろう');
  });
  it('汎用プレースホルダ名はアリーナに座らない(null)', () => {
    expect(venueParticipantKey({ name: '匿名' }, isGeneric)).toBeNull();
  });
  it('名前が無ければ userId があってもアリーナに座らない(匿名扱い)', () => {
    // ユーザー方針「匿名はアリーナじゃないみたいなのがいい」: userId 付き匿名も席に出さない。
    expect(venueParticipantKey({ userId: '999', name: '匿名' }, isGeneric)).toBeNull();
    expect(venueParticipantKey({ userId: '999' })).toBeNull();
  });
});

describe('countAnonymousParticipants', () => {
  it('匿名は userId 単位でユニークに数える', () => {
    const rows = [
      { userId: 'x', name: '匿名', text: '1' },
      { userId: 'x', name: '匿名', text: '2' }, // 同じ匿名ID連投=1人
      { userId: 'y', name: '匿名', text: '3' },
      { userId: 'a', name: 'A', text: '4' } // 名前あり=アリーナ=匿名に数えない
    ];
    expect(countAnonymousParticipants(rows, isGeneric)).toBe(2);
  });
  it('userId 無し匿名は最大1人ぶんだけ加える(水増ししない)', () => {
    const rows = [
      { name: '匿名', text: '1' },
      { name: '名無し', text: '2' },
      { text: '3' }
    ];
    expect(countAnonymousParticipants(rows, isGeneric)).toBe(1);
  });
});

describe('collectVenueParticipants', () => {
  it('同一参加者をまとめ最終発言と発言数を集計する', () => {
    const rows = [
      { userId: 'a', name: 'A', text: 'おはよう', capturedAt: 100 },
      { userId: 'a', name: 'A', text: 'こんにちは', capturedAt: 300 },
      { userId: 'b', name: 'B', text: 'やあ', capturedAt: 200 }
    ];
    const ps = collectVenueParticipants(rows);
    expect(ps).toHaveLength(2);
    const a = ps.find((p) => p.key === 'u:a');
    expect(a.count).toBe(2);
    expect(a.lastText).toBe('こんにちは');
    expect(a.lastAt).toBe(300);
  });

  it('ギフトフラグを保持する', () => {
    const rows = [
      { userId: 'a', name: 'A', text: 'ギフト!', capturedAt: 100, isGift: true }
    ];
    expect(collectVenueParticipants(rows)[0].hasGift).toBe(true);
  });

  it('匿名(汎用名)はアリーナ参加者から除外する', () => {
    const rows = [
      { name: '匿名', text: 'x', capturedAt: 1 },
      { userId: 'b', name: '匿名', text: 'z', capturedAt: 3 }, // userId付き匿名も除外
      { userId: 'a', name: 'A', text: 'y', capturedAt: 2 }
    ];
    const ps = collectVenueParticipants(rows, { isGenericName: isGeneric });
    expect(ps).toHaveLength(1);
    expect(ps[0].key).toBe('u:a');
  });

  it('初出順を保つ', () => {
    const rows = [
      { userId: 'b', name: 'B', text: '1', capturedAt: 10 },
      { userId: 'a', name: 'A', text: '2', capturedAt: 20 }
    ];
    expect(collectVenueParticipants(rows).map((p) => p.key)).toEqual(['u:b', 'u:a']);
  });
});

describe('resolveVenueLayoutMode', () => {
  it('人数でモードが切り替わる(empty/vip/normal/packed)', () => {
    expect(resolveVenueLayoutMode(0)).toBe('empty');
    expect(resolveVenueLayoutMode(1)).toBe('vip');
    expect(resolveVenueLayoutMode(8)).toBe('vip');
    expect(resolveVenueLayoutMode(9)).toBe('normal');
    expect(resolveVenueLayoutMode(30)).toBe('normal');
    expect(resolveVenueLayoutMode(31)).toBe('packed');
    expect(resolveVenueLayoutMode(150)).toBe('packed');
  });
  it('不正値は empty に丸める', () => {
    expect(resolveVenueLayoutMode(-3)).toBe('empty');
    expect(resolveVenueLayoutMode(NaN)).toBe('empty');
  });
});

describe('rankVenueParticipants', () => {
  it('ギフト参加者を優先し、次に最終発言が新しい順', () => {
    const ps = [
      { key: 'u:a', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 100, count: 1, hasGift: true },
      { key: 'u:c', lastAt: 200, count: 1, hasGift: false }
    ];
    expect(rankVenueParticipants(ps).map((p) => p.key)).toEqual(['u:b', 'u:a', 'u:c']);
  });

  it('maxSeats を超えた静かな参加者は降ろす(入れ替え)', () => {
    const ps = [
      { key: 'u:a', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 200, count: 1, hasGift: false },
      { key: 'u:c', lastAt: 100, count: 1, hasGift: false }
    ];
    const ranked = rankVenueParticipants(ps, 2);
    expect(ranked.map((p) => p.key)).toEqual(['u:a', 'u:b']);
  });
});

describe('assignVenueSeats', () => {
  it('前回の席を維持する(同じ人=同じ席=吹き出しが飛ばない)', () => {
    const ranked = [
      { key: 'u:a', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 200, count: 1, hasGift: false }
    ];
    const prev = new Map([['u:a', 5], ['u:b', 2]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 50);
    expect(seatByKey.get('u:a')).toBe(5);
    expect(seatByKey.get('u:b')).toBe(2);
  });

  it('降りた人の席を新規参加者が埋める(入れ替え)', () => {
    // 前回 u:a が席0、u:b が席1。今回 u:a が降り u:c が新規参加。
    const ranked = [
      { key: 'u:b', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:c', lastAt: 200, count: 1, hasGift: false }
    ];
    const prev = new Map([['u:a', 0], ['u:b', 1]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 50);
    expect(seatByKey.get('u:b')).toBe(1); // 維持
    expect(seatByKey.get('u:c')).toBe(0); // 空いた席0を埋める
  });

  it('席は昇順で返る', () => {
    const ranked = [
      { key: 'u:a', lastAt: 1, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 1, count: 1, hasGift: false }
    ];
    const prev = new Map([['u:a', 3], ['u:b', 1]]);
    const { seats } = assignVenueSeats(ranked, prev, 50);
    expect(seats.map((s) => s.seatIndex)).toEqual([1, 3]);
  });

  it('prev が範囲外/重複でも安全に再割り当てする', () => {
    const ranked = [
      { key: 'u:a', lastAt: 1, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 1, count: 1, hasGift: false }
    ];
    // u:a の前回席が cap 超過(99)→無視して空き席を割り当て
    const prev = new Map([['u:a', 99], ['u:b', 0]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 3);
    expect(seatByKey.get('u:b')).toBe(0);
    expect(seatByKey.get('u:a')).toBe(1);
  });
});

describe('buildVenueSeating', () => {
  it('発言行から席割りまで一気通貫し前列フラグを付ける', () => {
    const rows = [];
    for (let i = 0; i < 25; i++) {
      rows.push({ userId: `u${i}`, name: `U${i}`, text: `c${i}`, capturedAt: i });
    }
    const { seats, participantCount } = buildVenueSeating(rows, { frontRowSeats: 20 });
    expect(participantCount).toBe(25);
    expect(seats).toHaveLength(25);
    expect(seats.filter((s) => s.isFrontRow)).toHaveLength(20);
    expect(seats.filter((s) => !s.isFrontRow)).toHaveLength(5);
  });

  it('seatByKey を次回入力に渡すと席が安定する', () => {
    const rows1 = [
      { userId: 'a', name: 'A', text: '1', capturedAt: 10 },
      { userId: 'b', name: 'B', text: '2', capturedAt: 20 }
    ];
    const r1 = buildVenueSeating(rows1);
    const seatA = r1.seatByKey.get('u:a');
    // 次フレーム: A がさらに発言(席は変わらないはず)
    const rows2 = [...rows1, { userId: 'a', name: 'A', text: '3', capturedAt: 30 }];
    const r2 = buildVenueSeating(rows2, { prevSeatByKey: r1.seatByKey });
    expect(r2.seatByKey.get('u:a')).toBe(seatA);
  });

  it('名前ありはアリーナ席・匿名は anonymousCount に分離する', () => {
    const rows = [
      { userId: 'a', name: 'A', text: '1', capturedAt: 10 },
      { userId: 'x', name: '匿名', text: '2', capturedAt: 20 },
      { userId: 'y', name: '匿名', text: '3', capturedAt: 30 }
    ];
    const r = buildVenueSeating(rows, { isGenericName: isGeneric });
    expect(r.seats).toHaveLength(1); // アリーナは A のみ
    expect(r.participantCount).toBe(1);
    expect(r.anonymousCount).toBe(2); // 匿名2人(x, y)
  });

  it('既定の上限と前列定数', () => {
    expect(VENUE_MAX_SEATS).toBe(50);
    expect(VENUE_FRONT_ROW_SEATS).toBe(20);
    expect(VENUE_FULLSCREEN_MAX_SEATS).toBe(150);
  });
});

describe('venueRowsFromUserLaneCandidates', () => {
  it('userLane集計の出力を会場行へ変換する(名前ありはアリーナ・匿名は観客)', () => {
    const candidates = [
      { userId: '100', nickname: 'たろう', avatarUrl: 'https://x/a.png', _laneSortAt: 300 },
      { userId: '200', nickname: '', avatarUrl: 'https://x/b.png', _laneSortAt: 200 }, // 匿名(名前なし)
      { userId: '', nickname: 'ゴースト', _laneSortAt: 100 } // userId 無し=除外
    ];
    const rows = venueRowsFromUserLaneCandidates(candidates);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userId: '100', name: 'たろう', avatar: 'https://x/a.png', capturedAt: 300 });
    expect(rows[1]).toMatchObject({ userId: '200', name: '', capturedAt: 200 });

    // 会場席に流すと: 名前ありはアリーナ、名前なしは観客に分離される
    const seating = buildVenueSeating(rows, { maxSeats: VENUE_FULLSCREEN_MAX_SEATS });
    expect(seating.participantCount).toBe(1); // たろうのみアリーナ
    expect(seating.anonymousCount).toBe(1); // userId 200 の匿名
  });

  it('非配列や不正要素を安全に無視する', () => {
    expect(venueRowsFromUserLaneCandidates(null)).toEqual([]);
    expect(venueRowsFromUserLaneCandidates([null, {}, { userId: ' ' }])).toEqual([]);
  });
});

describe('buildVenueTiers', () => {
  it('0人は空', () => {
    expect(buildVenueTiers(0)).toEqual([]);
  });

  it('少人数(<=8)は1段・手前スケール1.0', () => {
    const t = buildVenueTiers(5);
    expect(t).toHaveLength(1);
    expect(t[0].count).toBe(5);
    expect(t[0].scale).toBe(1);
    expect(t[0].depth).toBe(0);
  });

  it('人数が増えると段数が増える', () => {
    expect(buildVenueTiers(8)).toHaveLength(1);
    expect(buildVenueTiers(16)).toHaveLength(2);
    expect(buildVenueTiers(30)).toHaveLength(3);
    expect(buildVenueTiers(50)).toHaveLength(4);
    expect(buildVenueTiers(150)).toHaveLength(5);
  });

  it('全段の合計人数が入力と一致する(取りこぼし/水増しなし)', () => {
    for (const n of [3, 9, 17, 31, 55, 99, 150]) {
      const total = buildVenueTiers(n).reduce((a, t) => a + t.count, 0);
      expect(total).toBe(n);
    }
  });

  it('手前ほど大きく奥ほど小さい(scaleが単調減少)', () => {
    const t = buildVenueTiers(30);
    for (let i = 1; i < t.length; i += 1) {
      expect(t[i].scale).toBeLessThan(t[i - 1].scale);
    }
    // 最奥は minScale 付近(ほどよく立体=既定0.62)
    expect(t[t.length - 1].scale).toBeCloseTo(0.62, 5);
  });

  it('奥の段ほど横に広い(後方客席が広がる)', () => {
    const t = buildVenueTiers(30);
    // 前列より最奥のほうが席数が多い(重み +25%/段)
    expect(t[t.length - 1].count).toBeGreaterThanOrEqual(t[0].count);
  });

  it('minScale を指定できる', () => {
    const t = buildVenueTiers(30, { minScale: 0.4 });
    expect(t[t.length - 1].scale).toBeCloseTo(0.4, 5);
  });
});
