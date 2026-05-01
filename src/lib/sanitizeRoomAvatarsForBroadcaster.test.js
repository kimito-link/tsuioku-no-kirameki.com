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

  it('broadcasterUid 未取得でも universal rule (uid 不一致) は生きる', () => {
    // 0.1.98: 旧 0.1.78 では「broadcaster 情報なし → 全体 no-op」だったが、
    // 0.1.83 普遍ルール（URL の uid と entry uid 一致）は broadcaster 文脈と独立。
    // entry uid 4046119 vs URL uid 99999 → 取り違え確定で strip。
    const out = sanitizeRoomAvatarForBroadcaster(
      { userKey: '4046119', avatarUrl: broadcasterIconUrl, count: 5 },
      { broadcasterUid: '', broadcasterIconUrl }
    );
    expect(out.avatarUrl).toBe('');
  });

  it('broadcasterUid 未取得 + custom URL (niconico icon でない) → no-op', () => {
    // niconico icon パターンに該当しない URL は universal rule の対象外。
    // broadcaster 情報も無いので strip しない。
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl: 'https://custom-cdn.example/photo.jpg',
        count: 5
      },
      { broadcasterUid: '', broadcasterIconUrl: 'https://custom-cdn.example/photo.jpg' }
    );
    expect(out.avatarUrl).toBe('https://custom-cdn.example/photo.jpg');
  });

  it('broadcasterIconUrl 未取得でも universal rule は生きる', () => {
    // broadcasterIconUrl が空でも、URL から uid を抽出して
    // entry uid と一致しなければ strip する。
    const out = sanitizeRoomAvatarForBroadcaster(
      { userKey: '4046119', avatarUrl: broadcasterIconUrl, count: 5 },
      { broadcasterUid, broadcasterIconUrl: '' }
    );
    expect(out.avatarUrl).toBe('');
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

  it('0.1.97: 同じ broadcaster icon でも size 違い (s vs uri150x150 vs m) は同じ汚染と判定', () => {
    // ctx の broadcasterIconUrl は /s/ サイズ。viewer 側 storage に
    // /uri150x150/ で焼き込まれた汚染も検出する。
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/9/99999.jpg',
        count: 5
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.97: m サイズの broadcaster icon も検出', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/m/9/99999.jpg',
        count: 5
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.97: UNKNOWN_USER_KEY (uid 不明) の room に broadcaster icon が乗っているケースも検出', () => {
    // 「ID 未取得（DOM に投稿者情報なし）」のコメントが broadcaster icon を
    // 抱き込んで rank strip 1 番目に出る現象（lv350429771 で実機確認）
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '__unknown__',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/9/99999.jpg',
        count: 1
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.97: query string + size 違いの組み合わせでも検出', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/m/9/99999.jpg?cache=1',
        count: 5
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.97: 同じパターン (uid 99999) を含むが broadcasterIconUrl と全く違うドメインは通す（保守的）', () => {
    // niconico CDN 以外のドメインで /99999.jpg があったら？
    // → uid 抽出は niconico CDN 形式のみマッチするので通す（誤検出しない）
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl: 'https://cdn.example/avatar/99999.jpg',
        count: 5
      },
      ctx
    );
    // extractNiconicoUserIdFromIconUrl は domain-agnostic だが
    // 「99999」が抽出されて broadcasterUid と一致するなら strip する
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.98: a:xxx 匿名 entry に niconico user icon (broadcaster でない別人 uid) が乗ってたら strip', () => {
    // 匿名ユーザーに niconico user icon は本来あり得ない（identicon が出る設計）。
    // 別 lv の broadcaster (例: 別配信のだるまくん 55141222) が混入していても
    // strip。filter を「current broadcaster 一人」だけに依存させない。
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: 'a:Xu-Sy7ai1e_kgbq3',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/5/55141222.jpg',
        count: 3
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.98: UNKNOWN_USER_KEY entry に niconico user icon (broadcaster でない別人 uid) が乗ってたら strip', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '__unknown__',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/55/55141222.jpg',
        count: 1
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.98: 数値 uid entry の avatar URL が別 uid の niconico icon なら strip (普遍ルール)', () => {
    // 0.1.83 の普遍ルール (URL の uid とエントリ uid 一致) を sanitize にも適用。
    // entry uid 4046119 vs URL uid 55141222 → 取り違え確定
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/55/55141222.jpg',
        count: 5
      },
      ctx
    );
    expect(out.avatarUrl).toBe('');
  });

  it('0.1.98: 数値 uid entry の avatar URL が同じ uid の niconico icon なら通す（正常）', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: '4046119',
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/40/4046119.jpg',
        count: 5
      },
      ctx
    );
    expect(out.avatarUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/40/4046119.jpg'
    );
  });

  it('0.1.98: 匿名 entry でも niconico user icon ではない URL（identicon, custom CDN）は通す', () => {
    const out = sanitizeRoomAvatarForBroadcaster(
      {
        userKey: 'a:abcd1234',
        avatarUrl: 'data:image/svg+xml;base64,iVBORw0K...',
        count: 2
      },
      ctx
    );
    expect(out.avatarUrl).toBe('data:image/svg+xml;base64,iVBORw0K...');
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
