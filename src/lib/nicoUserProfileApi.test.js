import { describe, it, expect } from 'vitest';
import {
  NICO_USER_PROFILE_FETCH_MESSAGE_TYPE,
  isResolvableNicoUid,
  buildNicoUserProfileUrl,
  isLikelyNicoUserProfileShape,
  normalizeNicoUserProfileResponse
} from './nicoUserProfileApi.js';

describe('nicoUserProfileApi', () => {
  it('メッセージ type は固定値（background.js と同期）', () => {
    expect(NICO_USER_PROFILE_FETCH_MESSAGE_TYPE).toBe('NLS_NICO_USER_PROFILE_FETCH');
  });

  describe('isResolvableNicoUid', () => {
    it('正の整数のみ true（匿名/合成キー/0 は false）', () => {
      expect(isResolvableNicoUid('5428353')).toBe(true);
      expect(isResolvableNicoUid(5428353)).toBe(true);
      expect(isResolvableNicoUid('1')).toBe(true);
      expect(isResolvableNicoUid('0')).toBe(false);
      expect(isResolvableNicoUid('')).toBe(false);
      expect(isResolvableNicoUid('__anon_gift_x')).toBe(false);
      expect(isResolvableNicoUid('u/__ad_1_')).toBe(false);
      expect(isResolvableNicoUid('abc')).toBe(false);
      expect(isResolvableNicoUid(null)).toBe(false);
    });
  });

  describe('buildNicoUserProfileUrl', () => {
    it('正の整数 uid で nvapi URL を組む', () => {
      expect(buildNicoUserProfileUrl('5428353')).toBe(
        'https://nvapi.nicovideo.jp/v1/users/5428353'
      );
    });
    it('不正 uid は null（SSRF面遮断）', () => {
      expect(buildNicoUserProfileUrl('0')).toBeNull();
      expect(buildNicoUserProfileUrl('')).toBeNull();
      expect(buildNicoUserProfileUrl('1; rm')).toBeNull();
      expect(buildNicoUserProfileUrl('../../etc')).toBeNull();
      expect(buildNicoUserProfileUrl(null)).toBeNull();
    });
  });

  describe('isLikelyNicoUserProfileShape', () => {
    it('data.user オブジェクトを持てば true', () => {
      expect(isLikelyNicoUserProfileShape({ data: { user: { id: 1 } } })).toBe(true);
      expect(
        isLikelyNicoUserProfileShape({ meta: { status: 200 }, data: { user: { id: 1 } } })
      ).toBe(true);
    });
    it('meta.status!=200 / user 欠落 / 非オブジェクトは false', () => {
      expect(isLikelyNicoUserProfileShape({ meta: { status: 404 }, data: { user: {} } })).toBe(
        false
      );
      expect(isLikelyNicoUserProfileShape({ data: {} })).toBe(false);
      expect(isLikelyNicoUserProfileShape(null)).toBe(false);
    });
  });

  describe('normalizeNicoUserProfileResponse', () => {
    // 実 nvapi(user/5428353)を模した応答
    const realLike = {
      meta: { status: 200 },
      data: {
        user: {
          id: 5428353,
          nickname: '○●丸',
          icons: {
            small: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/542/5428353.jpg?1',
            large: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/542/5428353.jpg?1'
          }
        }
      }
    };

    it('id/nickname/icons.large を正規化（large 優先）', () => {
      const p = normalizeNicoUserProfileResponse(realLike);
      expect(p).toEqual({
        userId: '5428353',
        nickname: '○●丸',
        avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/542/5428353.jpg?1'
      });
    });

    it('icons.large が無ければ small にフォールバック', () => {
      const p = normalizeNicoUserProfileResponse({
        data: { user: { id: 7, nickname: 'A', icons: { small: 'https://x/y/7.jpg' } } }
      });
      expect(p.avatarUrl).toBe('https://x/y/7.jpg');
    });

    it('nickname だけ（icons 無し）でも採用', () => {
      const p = normalizeNicoUserProfileResponse({
        data: { user: { id: 7, nickname: 'のみ名前' } }
      });
      expect(p).toEqual({ userId: '7', nickname: 'のみ名前', avatarUrl: '' });
    });

    it('http(s) でないアイコンURLは落とす', () => {
      const p = normalizeNicoUserProfileResponse({
        data: { user: { id: 7, nickname: 'A', icons: { large: 'javascript:alert(1)' } } }
      });
      expect(p.avatarUrl).toBe('');
    });

    it('uid が正の整数でない / user 欠落 / nickname も avatar も無い → null', () => {
      expect(
        normalizeNicoUserProfileResponse({ data: { user: { id: 0, nickname: 'x' } } })
      ).toBeNull();
      expect(normalizeNicoUserProfileResponse({ data: {} })).toBeNull();
      expect(
        normalizeNicoUserProfileResponse({ data: { user: { id: 7 } } })
      ).toBeNull(); // nickname も icons も無い
      expect(normalizeNicoUserProfileResponse({ meta: { status: 500 } })).toBeNull();
      expect(normalizeNicoUserProfileResponse(null)).toBeNull();
    });
  });
});
