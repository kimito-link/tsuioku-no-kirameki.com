import { describe, it, expect } from 'vitest';
import { shouldAssociateAvatarWithUser } from './avatarBroadcasterGuard.js';

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

  it('broadcasterUid のみ未取得時もガード掛けず通す', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: broadcasterIconUrl,
        broadcasterUid: '',
        broadcasterIconUrl
      })
    ).toBe(true);
  });

  it('broadcasterIconUrl のみ未取得時もガード掛けず通す', () => {
    expect(
      shouldAssociateAvatarWithUser({
        uid: '4046119',
        av: broadcasterIconUrl,
        broadcasterUid,
        broadcasterIconUrl: ''
      })
    ).toBe(true);
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
