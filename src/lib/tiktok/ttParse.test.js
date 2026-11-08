import { describe, it, expect } from 'vitest';
import {
  parseTtUniqueIdFromUrl,
  ttRoomInfoUrl,
  parseTtRoomInfo,
  parseTtPushFrame,
  parseTtResponse,
  parseTtChat,
  parseTtGift,
  parseTtGiftList,
  ttGiftRow,
  createTtComboTracker,
  parseTtRoomUserSeq,
  parseTtMemberViewers,
  buildTtStreamKey,
  isTtStreamKey,
  ttUniqueIdOfStreamKey,
  ttRoomIdOfSocketUrl,
  safeTtImageUrl,
} from './ttParse.js';

// 小さな書き手(試験用・番号は 2026-11-09 PC 実測の形)
const enc = new TextEncoder();
/** @param {bigint|number} v */
function varint(v) {
  let x = BigInt(v);
  const out = [];
  do {
    let b = Number(x & 0x7fn);
    x >>= 7n;
    if (x) b |= 0x80;
    out.push(b);
  } while (x);
  return out;
}
/** @param {number} no @param {bigint|number} v */
const fv = (no, v) => [...varint((no << 3) | 0), ...varint(v)];
/** @param {number} no @param {Uint8Array|number[]|string} b */
const fb = (no, b) => {
  const bytes = typeof b === 'string' ? [...enc.encode(b)] : [...b];
  return [...varint((no << 3) | 2), ...varint(bytes.length), ...bytes];
};
const AV = 'https://p16-sign-sg.tiktokcdn.com/aweme/100x100/a.webp?x-expires=1';
const GIMG = 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/abc.png~tplv-obj.webp';
/** @param {string|number|bigint} id @param {string} nick @param {string} unique */
const user = (id, nick, unique) => [...fv(1, BigInt(id)), ...fb(3, nick), ...fb(9, fb(1, AV)), ...fb(38, unique)];
const common = (/** @type {number} */ ms) => fb(1, fv(4, ms));

describe('TikTok の URL・配信キー', () => {
  it('配信ページの名前を読む(配信ページ以外は空)', () => {
    expect(parseTtUniqueIdFromUrl('https://www.tiktok.com/@Some.User_1/live')).toBe('some.user_1');
    expect(parseTtUniqueIdFromUrl('https://www.tiktok.com/@someone')).toBe('');
    expect(parseTtUniqueIdFromUrl('https://www.tiktok.com/live')).toBe('');
    expect(parseTtUniqueIdFromUrl('https://evil.example/@a1/live')).toBe('');
    expect(ttRoomInfoUrl('a.b')).toBe('https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=a.b');
    expect(ttRoomInfoUrl('bad name')).toBe('');
  });
  it('配信キーは tt.<名前>.<roomId>(名前に . があっても戻せる)', () => {
    const k = buildTtStreamKey('Some.User', { roomId: '7571234567890123456' });
    expect(k).toBe('tt.some.user.7571234567890123456');
    expect(isTtStreamKey(k)).toBe(true);
    expect(ttUniqueIdOfStreamKey(k)).toBe('some.user');
    expect(buildTtStreamKey('a1', { roomId: '' })).toBe('');
    expect(isTtStreamKey('mx.1.2')).toBe(false);
  });
  it('ソケットの URL の room_id(webcast の口だけ)', () => {
    expect(ttRoomIdOfSocketUrl('wss://webcast-ws.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/?aid=1988&room_id=7571234567890123456&X-Bogus=x')).toBe('7571234567890123456');
    expect(ttRoomIdOfSocketUrl('wss://im-ws-sg.tiktok.com/ws/v2?room_id=7571234567890123456')).toBe('');
    expect(ttRoomIdOfSocketUrl('wss://webcast-ws.evil.com/?room_id=7571234567890123456')).toBe('');
  });
  it('絵の URL は TikTok の置き場の https だけ', () => {
    expect(safeTtImageUrl(GIMG)).toBe(GIMG);
    expect(safeTtImageUrl('http://p16-webcast.tiktokcdn.com/a.png')).toBe('');
    expect(safeTtImageUrl('https://example.com/a.png')).toBe('');
  });
});

describe('配信の情報(/api-live/user/room/)', () => {
  it('配信中(status 2)・題・開始・顔・視聴数', () => {
    const info = parseTtRoomInfo({
      data: {
        liveRoom: { status: 2, title: 'たいとる', startTime: 1762640000, liveRoomStats: { userCount: 333, enterCount: 900 } },
        user: { roomId: '7571234567890123456', nickname: 'はいしんしゃ', uniqueId: 'Some.User', avatarThumb: AV, status: 2 },
      },
      statusCode: 0,
    });
    expect(info).toMatchObject({ roomId: '7571234567890123456', isLive: true, title: 'たいとる', name: 'はいしんしゃ', uniqueId: 'some.user', iconUrl: AV, viewers: 333, startedAtMs: 1762640000000 });
  });
  it('配信なし(status 4)・形が違う', () => {
    expect(parseTtRoomInfo({ data: { liveRoom: { status: 4 }, user: { roomId: '7571234567890123456' } } })?.isLive).toBe(false);
    expect(parseTtRoomInfo({ data: {} })).toBe(null);
    expect(parseTtRoomInfo('x')).toBe(null);
  });
});

describe('ソケットの受信', () => {
  it('PushFrame(msg のときだけ本体を返す・gzip の印)', () => {
    const f = new Uint8Array([...fv(1, 1), ...fv(2, 99), ...fb(6, 'pb'), ...fb(7, 'msg'), ...fb(8, [0x1f, 0x8b, 8, 0])]);
    expect(parseTtPushFrame(f)).toMatchObject({ kind: 'msg', gzip: true });
    const hb = new Uint8Array([...fb(6, 'pb'), ...fb(7, 'hb'), ...fb(8, [1])]);
    expect(parseTtPushFrame(hb)).toBe(null);
  });
  it('Response の Message を並べる(型の名前が変なものは捨てる)', () => {
    const body = new Uint8Array([
      ...fb(1, [...fb(1, 'WebcastChatMessage'), ...fb(2, [1, 2]), ...fv(3, 7571000000000000001n)]),
      ...fb(1, [...fb(1, '<script>'), ...fb(2, [1])]),
      ...fb(2, 'cursor'),
    ]);
    const list = parseTtResponse(body);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'WebcastChatMessage', msgId: '7571000000000000001' });
  });
});

describe('コメント', () => {
  it('人・本文・時刻(common 1.4)', () => {
    const p = new Uint8Array([...common(1762640001234), ...fb(2, user('7000000000000000001', 'なまえ', 'fan.one')), ...fb(3, ' こんにちは\n')]);
    const r = parseTtChat(p, { msgId: '7571000000000000001', uniqueId: 'some.user', nowMs: 1762640005000 });
    expect(r).toMatchObject({
      id: 'tt-7571000000000000001',
      channelId: 'tt:7000000000000000001',
      name: 'なまえ',
      login: 'fan.one',
      iconUrl: AV,
      text: 'こんにちは',
      kind: 'text',
      postedAtMs: 1762640001234,
      channel: 'some.user',
    });
  });
  it('人・本文・msgId が欠けていれば捨てる', () => {
    expect(parseTtChat(new Uint8Array([...fb(3, 'x')]), { msgId: '1' })).toBe(null);
    expect(parseTtChat(new Uint8Array([...fb(2, user(5, 'a', 'aa')), ...fb(3, '')]), { msgId: '1' })).toBe(null);
    expect(parseTtChat(new Uint8Array([...fb(2, user(5, 'a', 'aa')), ...fb(3, 'x')]), { msgId: '' })).toBe(null);
  });
});

/** @param {{ giftId: number, count: number, end?: boolean, group?: number, type?: number, diamond?: number, en?: string, uid?: string }} o */
function gift(o) {
  const det = [...fb(1, fb(1, GIMG)), ...fv(5, o.giftId), ...fv(11, o.type ?? 1), ...fv(12, o.diamond ?? 1), ...fb(16, o.en ?? 'Rose')];
  return new Uint8Array([
    ...common(1762640002000),
    ...fv(2, o.giftId),
    ...(o.end ? [] : fv(3, 1)),
    ...fv(5, o.count),
    ...fb(7, user(o.uid || '7000000000000000002', 'おくりて', 'giver')),
    ...(o.end ? fv(9, 1) : []),
    ...fv(11, o.group ?? 1762640001999),
    ...fb(15, det),
  ]);
}

describe('ギフト', () => {
  const list = parseTtGiftList({
    data: {
      gifts: [
        { id: 5655, name: 'バラ', diamond_count: 1, combo: true, type: 1, image: { url_list: [GIMG] } },
        { id: 6064, name: 'ライオン', diamond_count: 500, combo: false, type: 2, icon: { url_list: ['https://x.example/a.png', GIMG] } },
        { id: 'bad' },
      ],
    },
  });
  const gifts = new Map(list.map((g) => [g.id, g]));
  it('gift/list → 日本語の名前・コイン・連打・絵', () => {
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ id: '6064', name: 'ライオン', diamond: 500, combo: false, imageUrl: GIMG });
  });
  it('一覧の名前を使い、コインは diamondCount × 個数', () => {
    const g = parseTtGift(gift({ giftId: 5655, count: 3, end: true }), { gifts });
    expect(g).toMatchObject({ giftId: '5655', count: 3, repeatEnd: true, combo: true, diamond: 1, name: 'バラ', imageUrl: GIMG });
    const row = ttGiftRow(/** @type {any} */ (g), 'some.user');
    expect(row).toMatchObject({ kind: 'superchat', amount: 3, currency: 'TTCOIN', giftName: 'バラ', text: 'バラ ×3', giftCount: 3, giftImageUrl: GIMG, channelId: 'tt:7000000000000000002' });
  });
  it('一覧が無いときは英語の名前らしいもの、それも無ければ「ギフト」', () => {
    expect(parseTtGift(gift({ giftId: 5655, count: 1, en: 'Rose' }))?.name).toBe('Rose');
    expect(parseTtGift(gift({ giftId: 5655, count: 1, en: '<b>x</b>' }))?.name).toBe('ギフト');
  });
  it('連打は終わりの印で1回だけ・途中の分は重ねない', () => {
    const t = createTtComboTracker({ waitMs: 8000 });
    const p = (/** @type {Uint8Array} */ b) => /** @type {any} */ (parseTtGift(b, { gifts }));
    expect(t.push(p(gift({ giftId: 5655, count: 1 })), 0)).toEqual([]);
    expect(t.push(p(gift({ giftId: 5655, count: 2 })), 100)).toEqual([]);
    const out = t.push(p(gift({ giftId: 5655, count: 3, end: true })), 200);
    expect(out.map((g) => g.count)).toEqual([3]);
    // 終わったあとに同じ連打の枠が遅れて来ても数えない
    expect(t.push(p(gift({ giftId: 5655, count: 3, end: true })), 300)).toEqual([]);
    expect(t.size).toBe(0);
  });
  it('連打できないギフトは終わりの印を待たずに数える', () => {
    const t = createTtComboTracker();
    const out = t.push(/** @type {any} */ (parseTtGift(gift({ giftId: 6064, count: 1, type: 2, diamond: 500 }), { gifts })), 0);
    expect(out).toHaveLength(1);
    expect(ttGiftRow(out[0], 'u1').amount).toBe(500);
  });
  it('終わりの印が来ない連打は待ってから最後の数で数える', () => {
    const t = createTtComboTracker({ waitMs: 8000 });
    const p = (/** @type {number} */ n) => /** @type {any} */ (parseTtGift(gift({ giftId: 5655, count: n }), { gifts }));
    t.push(p(1), 0);
    t.push(p(5), 1000);
    expect(t.flushDue(8999)).toEqual([]);
    expect(t.flushDue(9000).map((g) => g.count)).toEqual([5]);
    t.push(/** @type {any} */ (parseTtGift(gift({ giftId: 5655, count: 2, group: 42 }), { gifts })), 0);
    expect(t.flushDue(1, true)).toHaveLength(1);
  });
  it('人・giftId が欠けていれば捨てる', () => {
    expect(parseTtGift(new Uint8Array([...fv(2, 5655), ...fv(5, 1)]))).toBe(null);
    expect(parseTtGift(new Uint8Array([...fb(7, user(9, 'a', 'aa')), ...fv(5, 1)]))).toBe(null);
  });
});

describe('視聴数と配信中の順位', () => {
  it('RoomUserSeq の 3 = 視聴数・2[] = 順位(rank 順)', () => {
    const p = new Uint8Array([
      ...fb(2, [...fv(1, 50), ...fb(2, user(12, 'にい', 'b2')), ...fv(3, 2)]),
      ...fb(2, [...fv(1, 900), ...fb(2, user(11, 'いち', 'a1')), ...fv(3, 1)]),
      ...fb(2, [...fv(1, 1), ...fv(3, 3)]),
      ...fv(3, 334),
    ]);
    const r = parseTtRoomUserSeq(p);
    expect(r.viewers).toBe(334);
    expect(r.rows).toEqual([
      { rank: 1, name: 'いち', xp: 900, iconUrl: AV },
      { rank: 2, name: 'にい', xp: 50, iconUrl: AV },
    ]);
    expect(parseTtMemberViewers(new Uint8Array([...fb(2, user(1, 'a', 'aa')), ...fv(3, 340)]))).toBe(340);
    expect(parseTtMemberViewers(new Uint8Array([]))).toBe(null);
  });
});
