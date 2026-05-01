import { describe, it, expect } from 'vitest';
import {
  sanitizeRoomAvatarForBroadcaster,
  sanitizeRoomAvatarsForBroadcaster
} from './sanitizeRoomAvatarsForBroadcaster.js';

const broadcasterUid = '99999';
const broadcasterIconUrl =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/9/99999.jpg';
const ctx = { broadcasterUid, broadcasterIconUrl };

describe('sanitizeRoomAvatarForBroadcaster', () => {
  it('viewer room の avatarUrl が broadcaster icon → 空にする', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      { userKey: '4046119', avatarUrl: broadcasterIconUrl, count: 5 },
      ctx
    );
    expect(out.avatarUrl).toBe('');
    expect(out.count).toBe(5);
    expect(out.userKey).toBe('4046119');
  });

  it('broadcaster 本人 room は通す（avatarUrl 残す）', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      { userKey: broadcasterUid, avatarUrl: broadcasterIconUrl, count: 1 },
      ctx
    );
    expect(out.avatarUrl).toBe(broadcasterIconUrl);
  });

  it('viewer の正しい個人サムネは通す', () => {
    const personal = 'https://cdn.example/personal.jpg';
    const out = sanitizeRoomAvatarForBroadcaster(
      { userKey: '4046119', avatarUrl: personal, count: 5 },
      ctx
    );
    expect(out.avatarUrl).toBe(personal);
  });

  it('query string が違うだけの broadcaster icon もブロック', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl: `${broadcasterIconUrl}?v=2`,
        count: 5
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('broadcasterUid 未取得 → no-op', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      { userKey: '4046119', avatarUrl: broadcasterIconUrl, count: 5 },
      { broadcasterUid: '', broadcasterIconUrl }
    );
    expect(out.avatarUrl).toBe(broadcasterIconUrl);
  });

  it('broadcasterIconUrl 未取得 → no-op', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      { userKey: '4046119', avatarUrl: broadcasterIconUrl, count: 5 },
      { broadcasterUid, broadcasterIconUrl: '' }
    );
    expect(out.avatarUrl).toBe(broadcasterIconUrl);
  });

  it('avatarUrl が空 room はそのまま通す', () => {
    const room = { userKey: '4046119', avatarUrl: '', count: 5 };
    const out = sanitizeRoomAvatarForBroadcaster(room, ctx);
    expect(out).toBe(room);
  });

  it('null / undefined room でもクラッシュしない', () => {
    expect(sanitizeRoomAvatarForBroadcaster(null, ctx)).toBe(null);
    expect(sanitizeRoomAvatarForBroadcaster(undefined, ctx)).toBe(undefined);
  });

  it('完全に異なる avatar URL は通す', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl: 'https://cdn.example/totally-different.jpg',
        count: 5
      },
      ctx
    );
    expect(out.avatarUrl).toBe('https://cdn.example/totally-different.jpg');
  });
});

describe('sanitizeRoomAvatarsForBroadcaster (array)', () => {
  it('複数 room を一括で補正、汚染のみ avatarUrl 空に', () => {
    const rooms = [
      { userKey: '4046119', avatarUrl: broadcasterIconUrl, count: 5 },
      {
        userKey: '4523277',
        avatarUrl: 'https://cdn.example/maa.jpg',
        count: 3
      },
      { userKey: broadcasterUid, avatarUrl: broadcasterIconUrl, count: 1 }
    ];
    const out = sanitizeRoomAvatarsForBroadcaster(rooms, ctx);
    expect(out[0].avatarUrl).toBe('');
    expect(out[1].avatarUrl).toBe('https://cdn.example/maa.jpg');
    expect(out[2].avatarUrl).toBe(broadcasterIconUrl);
  });

  it('空配列 → 空配列', () => {
    expect(sanitizeRoomAvatarsForBroadcaster([], ctx)).toEqual([]);
  });

  it('null 入力 → 空配列', () => {
    // @ts-expect-error invalid input
    expect(sanitizeRoomAvatarsForBroadcaster(null, ctx)).toEqual([]);
  });

  it('元の配列を破壊しない（map なので新配列）', () => {
    const rooms = [
      { userKey: '4046119', avatarUrl: broadcasterIconUrl, count: 5 }
    ];
    const out = sanitizeRoomAvatarsForBroadcaster(rooms, ctx);
    expect(rooms[0].avatarUrl).toBe(broadcasterIconUrl);
    expect(out[0].avatarUrl).toBe('');
  });
});
