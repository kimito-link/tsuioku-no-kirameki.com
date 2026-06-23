import { describe, it, expect } from 'vitest';
import { userLanePicksFromUsers } from './userLanePicksFromUsers.js';

// 数値ID→個人アイコン URL(adLanePicksFromRooms の nicoIconUrlForUid と同式)。
const io = {
  numericIconUrlFor: (uid) =>
    /^\d{2,15}$/.test(String(uid))
      ? `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${Math.floor(Number(uid) / 10000)}/${uid}.jpg`
      : '',
  anonymousIdenticonFor: (uid) => `identicon:${uid}`
};

describe('userLanePicksFromUsers', () => {
  it('数値ID+与えられた avatar+ニックネーム → avatar をそのまま使い名前行にニックネーム', () => {
    const out = userLanePicksFromUsers(
      [{ userId: '12345678', nickname: 'びしゃ', avatarUrl: 'https://x/a.jpg', count: 42 }],
      io
    );
    expect(out).toHaveLength(1);
    expect(out[0].displaySrc).toBe('https://x/a.jpg');
    expect(out[0].entry.userId).toBe('12345678');
    expect(out[0].meta).toEqual({ idLine: '12345678', nameLine: 'びしゃ' });
    expect(out[0].title).toBe('びしゃ');
  });

  it('avatar 空でも数値IDなら個人アイコン URL を導出する(👤 代用にしない)', () => {
    const out = userLanePicksFromUsers([{ userId: '115734569', nickname: 'しいたけ' }], io);
    expect(out[0].displaySrc).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/11573/115734569.jpg'
    );
  });

  it('匿名スタイルIDで avatar も数値アイコンも無ければ identicon を使う', () => {
    const out = userLanePicksFromUsers([{ userId: 'a:AbCdEf', nickname: '' }], io);
    expect(out[0].displaySrc).toBe('identicon:a:AbCdEf');
    expect(out[0].meta.idLine).toBe('a:AbCd…');
    expect(out[0].meta.nameLine).toBe('匿名');
  });

  it('解決不能(非数値・非匿名・avatar無し)なら displaySrc は空=load guard がゆっくり画像へ', () => {
    const out = userLanePicksFromUsers([{ userId: '', nickname: 'ゲスト' }], io);
    expect(out[0].displaySrc).toBe('');
    // "👤" のような代用文字は一切出さない。
    expect(out[0].displaySrc).not.toContain('👤');
    expect(out[0].meta).toEqual({ idLine: '—', nameLine: 'ID未取得' });
  });

  it('userId も nickname も無い行は飛ばす(死に行を作らない)', () => {
    const out = userLanePicksFromUsers([{ userId: '', nickname: '' }, { userId: '12345678', nickname: 'あ' }], io);
    expect(out).toHaveLength(1);
    expect(out[0].entry.userId).toBe('12345678');
  });

  it('limit で表示上限を絞る(0/未指定は全件)', () => {
    const users = [
      { userId: '11111111', nickname: 'a' },
      { userId: '22222222', nickname: 'b' },
      { userId: '33333333', nickname: 'c' }
    ];
    expect(userLanePicksFromUsers(users, { ...io, limit: 2 })).toHaveLength(2);
    expect(userLanePicksFromUsers(users, io)).toHaveLength(3);
    expect(userLanePicksFromUsers(users, { ...io, limit: 0 })).toHaveLength(3);
  });

  it('name フィールド(nickname の別名)も拾う / thumbSrc も avatar として使う', () => {
    const out = userLanePicksFromUsers([{ userId: '12345678', name: 'のっぽ', thumbSrc: 'https://x/t.jpg' }], io);
    expect(out[0].meta.nameLine).toBe('のっぽ');
    expect(out[0].displaySrc).toBe('https://x/t.jpg');
  });

  it('入力が配列でない/空でも落ちない', () => {
    expect(userLanePicksFromUsers(null, io)).toEqual([]);
    expect(userLanePicksFromUsers(undefined, io)).toEqual([]);
    expect(userLanePicksFromUsers([], io)).toEqual([]);
  });
});
