import { describe, it, expect } from 'vitest';
import { adLanePicksFromRooms } from './adLanePicksFromRooms.js';

const io = { yukkuriFaceFor: (k) => `yukkuri:${k}` };

describe('adLanePicksFromRooms', () => {
  it('記名広告(数値uid)は entry.userId を採用しサムネを使う', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '144514252', nickname: 'ゲスト', count: 97633, avatarUrl: 'https://x/a.jpg', rankHint: 1 }],
      io
    );
    expect(out).toHaveLength(1);
    expect(out[0].entry.userId).toBe('144514252');
    expect(out[0].displaySrc).toBe('https://x/a.jpg');
    expect(out[0].meta.nameLine).toBe('ゲスト');
    expect(out[0].meta.idLine).toBe('広告');
  });

  it('ID無し広告(合成キー)も advertiserName で載せる(会議確定: 広告は全員表示)', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '__anon_ad_1', nickname: '伊藤福島', count: 30326, rankHint: 2 }],
      io
    );
    expect(out).toHaveLength(1);
    expect(out[0].entry.userId).toBe(''); // 合成キーは uid ではない
    expect(out[0].meta.nameLine).toBe('伊藤福島');
    expect(out[0].meta.idLine).toBe('#2'); // ID 無しは順位を出す
    expect(out[0].displaySrc).toBe('yukkuri:__anon_ad_1'); // サムネ無し→ゆっくり顔
  });

  it('サムネが無い記名広告は uid 由来のゆっくり顔', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '115734569', nickname: 'しいたけ', count: 24634 }],
      io
    );
    expect(out[0].displaySrc).toBe('yukkuri:115734569');
  });

  it('名前も uid も無い行は飛ばす', () => {
    const out = adLanePicksFromRooms([{ userKey: '__anon_ad_3', nickname: '' }], io);
    expect(out).toHaveLength(0);
  });

  it('limit で表示数を絞れる', () => {
    const rooms = [
      { userKey: '1000001', nickname: 'a', count: 5 },
      { userKey: '1000002', nickname: 'b', count: 4 },
      { userKey: '1000003', nickname: 'c', count: 3 }
    ];
    expect(adLanePicksFromRooms(rooms, { ...io, limit: 2 })).toHaveLength(2);
  });

  it('順序は room の順(公式 rank 順=貢pt降順)を保つ', () => {
    const rooms = [
      { userKey: '1000001', nickname: '1位', count: 100, rankHint: 1 },
      { userKey: '__anon_ad_2', nickname: '2位', count: 50, rankHint: 2 }
    ];
    const out = adLanePicksFromRooms(rooms, io);
    expect(out.map((p) => p.meta.nameLine)).toEqual(['1位', '2位']);
  });

  it('空入力・非配列で落ちない', () => {
    expect(adLanePicksFromRooms([], io)).toEqual([]);
    expect(adLanePicksFromRooms(null, io)).toEqual([]);
    expect(adLanePicksFromRooms(undefined, io)).toEqual([]);
  });
});
