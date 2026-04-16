import { describe, it, expect } from 'vitest';
import {
  isAnonymousLikeRoomKey,
  partitionRankedRoomsForStrip
} from './topSupportRankAnonymousFold.js';
import { UNKNOWN_USER_KEY } from './userRooms.js';

describe('isAnonymousLikeRoomKey', () => {
  it('数値IDは非匿名（false）', () => {
    expect(isAnonymousLikeRoomKey('12345678')).toBe(false);
    expect(isAnonymousLikeRoomKey('98765')).toBe(false);
  });

  it('a:xxxxx 形式は匿名（true）', () => {
    expect(isAnonymousLikeRoomKey('a:abcdef12')).toBe(true);
    expect(isAnonymousLikeRoomKey('A:ZZZ')).toBe(true);
  });

  it('長いハッシュ風 ID は匿名（true）', () => {
    expect(isAnonymousLikeRoomKey('k1j8h7g6f5d4s3a2q1')).toBe(true);
  });

  it('UNKNOWN_USER_KEY は匿名扱いにしない（別カテゴリなので false）', () => {
    expect(isAnonymousLikeRoomKey(UNKNOWN_USER_KEY)).toBe(false);
  });

  it('空文字は匿名扱い（情報なし＝個人アイコン期待できない）', () => {
    expect(isAnonymousLikeRoomKey('')).toBe(true);
    expect(isAnonymousLikeRoomKey('   ')).toBe(true);
  });
});

describe('partitionRankedRoomsForStrip', () => {
  const rows = [
    { userKey: 'a:AAA001', count: 50 },
    { userKey: 'a:AAA002', count: 40 },
    { userKey: 'a:AAA003', count: 30 },
    { userKey: '12345678', count: 20 },
    { userKey: 'a:AAA004', count: 18 },
    { userKey: '98765432', count: 15 },
    { userKey: UNKNOWN_USER_KEY, count: 12 },
    { userKey: 'a:AAA005', count: 10 }
  ];

  it('foldAnonymous=true のとき UNKNOWN → 数値ID → 匿名 の順になる', () => {
    const out = partitionRankedRoomsForStrip(rows, { foldAnonymous: true });
    expect(out.map((r) => r.userKey)).toEqual([
      UNKNOWN_USER_KEY,
      '12345678',
      '98765432',
      'a:AAA001',
      'a:AAA002',
      'a:AAA003',
      'a:AAA004',
      'a:AAA005'
    ]);
  });

  it('foldAnonymous=true の各バケット内では入力順が保たれる（＝元のスコア順）', () => {
    const out = partitionRankedRoomsForStrip(rows, { foldAnonymous: true });
    const anon = out.filter((r) => r.userKey.startsWith('a:'));
    expect(anon.map((r) => r.userKey)).toEqual([
      'a:AAA001',
      'a:AAA002',
      'a:AAA003',
      'a:AAA004',
      'a:AAA005'
    ]);
  });

  it('既定（opts 省略）は foldAnonymous=true と同じ挙動', () => {
    const out = partitionRankedRoomsForStrip(rows);
    expect(out[0].userKey).toBe(UNKNOWN_USER_KEY);
    expect(out[1].userKey).toBe('12345678');
    expect(out[2].userKey).toBe('98765432');
  });

  it('foldAnonymous=false のときは入力順をそのまま返す（コピー）', () => {
    const out = partitionRankedRoomsForStrip(rows, { foldAnonymous: false });
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it('入力が配列でないときは空配列を返す', () => {
    expect(partitionRankedRoomsForStrip(null)).toEqual([]);
    expect(partitionRankedRoomsForStrip(undefined)).toEqual([]);
  });

  it('11枠スライス想定: 匿名9＋数値2 が 11 枠に両方収まる（数値が先頭で埋没しない）', () => {
    const many = [
      ...Array.from({ length: 9 }, (_, i) => ({
        userKey: `a:A${i}`,
        count: 100 - i
      })),
      { userKey: '11111111', count: 30 },
      { userKey: '22222222', count: 25 }
    ];
    const out = partitionRankedRoomsForStrip(many, { foldAnonymous: true });
    // スライス前でも数値 ID 2 件が先頭付近に来ていて、11 枠スライス後に残る
    const sliced = out.slice(0, 11);
    expect(sliced.find((r) => r.userKey === '11111111')).toBeTruthy();
    expect(sliced.find((r) => r.userKey === '22222222')).toBeTruthy();
  });
});
