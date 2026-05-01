import { describe, it, expect } from 'vitest';
import {
  shouldAssociateAvatarWithUser,
  extractNiconicoUserIdFromIconUrl
} from './avatarBroadcasterGuard.js';

describe('shouldAssociateAvatarWithUser', () => {
  const broadcasterUid = '99999';
  const broadcasterIconUrl =
    'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/9/99999.jpg';

  it('viewer の avatar が broadcaster アイコンに化けるケースをブロックする', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: broadcasterIconUrl,
        broadcasterUid,
        broadcasterIconUrl
      })
    ).toBe(false);
  });

  it('broadcaster 本人 uid に broadcaster icon は通す', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: broadcasterUid,
        av: broadcasterIconUrl,
        broadcasterUid,
        broadcasterIconUrl
      })
    ).toBe(true);
  });

  it('viewer の正しいアバターは通す', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/4/4046119.jpg',
        broadcasterUid,
        broadcasterIconUrl
      })
    ).toBe(true);
  });

  it('query string が違うだけの broadcaster icon もブロックする', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: `${broadcasterIconUrl}?cache_buster=1234`,
        broadcasterUid,
        broadcasterIconUrl
      })
    ).toBe(false);
  });

  it('broadcaster 情報未取得時はガード掛けず通す（false positive 回避）', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: broadcasterIconUrl,
        broadcasterUid: '',
        broadcasterIconUrl: ''
      })
    ).toBe(true);
  });

  it('broadcasterUid 未取得時はガード掛けず通す（最終判定ができないため）', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: broadcasterIconUrl,
        broadcasterUid: '',
        broadcasterIconUrl
      })
    ).toBe(true);
  });

  it('broadcasterIconUrl のみ未取得でも broadcasterUid から URL 抽出でブロック', () => {
    // 0.1.80: snapshot.broadcasterIconUrl が未取得でも、コメ DOM 由来の URL から
    //         uid を抽出して broadcasterUid と照合できる（より強力なガード）
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: broadcasterIconUrl,
        broadcasterUid,
        broadcasterIconUrl: ''
      })
    ).toBe(false);
  });

  it('uid が空のときは紐付け不可だが入力エラー扱いで true 返却（呼び出し元で判定）', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '',
        av: broadcasterIconUrl,
        broadcasterUid,
        broadcasterIconUrl
      })
    ).toBe(true);
  });

  it('av が空のときは入力エラー扱いで true 返却（呼び出し元で判定）', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: '',
        broadcasterUid,
        broadcasterIconUrl
      })
    ).toBe(true);
  });

  it('完全に異なる broadcaster icon URL は通す', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: 'https://example.com/other-icon.png',
        broadcasterUid,
        broadcasterIconUrl
      })
    ).toBe(true);
  });

  it('null / undefined 入力でクラッシュしない', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: null,
        av: undefined,
        broadcasterUid: null,
        broadcasterIconUrl: undefined
      })
    ).toBe(true);
  });

  it('input 自体が null / undefined でもクラッシュしない', () => {
    // @ts-expect-error invalid input
    expect(shouldAssociateAvatarWithUser(null)).toBe(true);
    // @ts-expect-error invalid input
    expect(shouldAssociateAvatarWithUser(undefined)).toBe(true);
  });
});

describe('extractNiconicoUserIdFromIconUrl', () => {
  it('小サイズ /s/ の URL から uid を抽出', () => {
    expect(
      extractNiconicoUserIdFromIconUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14367/143675916.jpg'
      )
    ).toBe('143675916');
  });

  it('中サイズ /m/ も抽出', () => {
    expect(
      extractNiconicoUserIdFromIconUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/m/4/4046119.jpg'
      )
    ).toBe('4046119');
  });

  it('uri150x150 サイズも抽出', () => {
    expect(
      extractNiconicoUserIdFromIconUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/9/99999.jpg'
      )
    ).toBe('99999');
  });

  it('クエリ string 付きでも抽出', () => {
    expect(
      extractNiconicoUserIdFromIconUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14367/143675916.jpg?cache_buster=1'
      )
    ).toBe('143675916');
  });

  it('PNG / GIF / WebP 拡張子も対応', () => {
    expect(
      extractNiconicoUserIdFromIconUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14367/143675916.png'
      )
    ).toBe('143675916');
  });

  it('niconico 以外の URL は空文字', () => {
    expect(
      extractNiconicoUserIdFromIconUrl('https://example.com/photo.jpg')
    ).toBe('');
  });

  it('null / undefined / 空文字 → 空文字', () => {
    expect(extractNiconicoUserIdFromIconUrl(null)).toBe('');
    expect(extractNiconicoUserIdFromIconUrl(undefined)).toBe('');
    expect(extractNiconicoUserIdFromIconUrl('')).toBe('');
  });
});

describe('shouldAssociateAvatarWithUser - 0.1.80: サイズバリアント対応', () => {
  const broadcasterUid = '143675916';
  // snapshot は 150x150 を返す典型
  const broadcasterIconUrl150 =
    'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/14367/143675916.jpg';
  // コメ harvester は /s/ 小サイズを拾う
  const contaminatedIconSmall =
    'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14367/143675916.jpg';

  it('snapshot が 150x150・観測 av が /s/ でも uid 抽出で同一視してブロック', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: contaminatedIconSmall,
        broadcasterUid,
        broadcasterIconUrl: broadcasterIconUrl150
      })
    ).toBe(false);
  });

  it('broadcaster 本人 uid なら通す（サイズ違いでも）', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: broadcasterUid,
        av: contaminatedIconSmall,
        broadcasterUid,
        broadcasterIconUrl: broadcasterIconUrl150
      })
    ).toBe(true);
  });

  it('broadcasterIconUrl 未指定でも broadcasterUid だけで URL から判定可能', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: contaminatedIconSmall,
        broadcasterUid,
        broadcasterIconUrl: ''
      })
    ).toBe(false);
  });

  it('別ユーザー（broadcaster 以外）の icon は通す', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/4/4046119.jpg',
        broadcasterUid,
        broadcasterIconUrl: broadcasterIconUrl150
      })
    ).toBe(true);
  });

  it('broadcaster の channel icon URL（数字 uid 抽出不可）は完全 URL 一致のみ', () => {
    const channelIcon = 'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/foo.png';
    // /<digits>.<ext> 形式じゃないので uid 抽出不可、isSameAvatarUrl で判定
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: channelIcon,
        broadcasterUid: 'ch12345',
        broadcasterIconUrl: channelIcon
      })
    ).toBe(false);
  });
});
