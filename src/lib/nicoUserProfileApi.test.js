import { describe, it, expect } from 'vitest';
import {
  NICO_USER_PROFILE_FETCH_MESSAGE_TYPE,
  isResolvableNicoUid,
  buildNicoUserProfileUrl,
  isLikelyNicoUserProfileShape,
  normalizeNicoUserProfileResponse
} from './nicoUserProfileApi.js';

describe('nicoUserProfileApi', () => {
  it('message type is stable for background.js', () => {
    expect(NICO_USER_PROFILE_FETCH_MESSAGE_TYPE).toBe('NLS_NICO_USER_PROFILE_FETCH');
  });

  it('accepts only positive numeric niconico user ids', () => {
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

  it('builds the fixed nvapi profile URL only for valid ids', () => {
    expect(buildNicoUserProfileUrl('5428353')).toBe(
      'https://nvapi.nicovideo.jp/v1/users/5428353'
    );
    expect(buildNicoUserProfileUrl('0')).toBeNull();
    expect(buildNicoUserProfileUrl('1; rm')).toBeNull();
    expect(buildNicoUserProfileUrl('../../etc')).toBeNull();
    expect(buildNicoUserProfileUrl(null)).toBeNull();
  });

  it('recognizes the nvapi response shape', () => {
    expect(isLikelyNicoUserProfileShape({ data: { user: { id: 1 } } })).toBe(true);
    expect(
      isLikelyNicoUserProfileShape({ meta: { status: 200 }, data: { user: { id: 1 } } })
    ).toBe(true);
    expect(isLikelyNicoUserProfileShape({ meta: { status: 404 }, data: { user: {} } })).toBe(
      false
    );
    expect(isLikelyNicoUserProfileShape({ data: {} })).toBe(false);
    expect(isLikelyNicoUserProfileShape(null)).toBe(false);
  });

  it('normalizes id, nickname, and icon URL with large icon priority', () => {
    const profile = normalizeNicoUserProfileResponse({
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
    });
    expect(profile).toEqual({
      userId: '5428353',
      nickname: '○●丸',
      avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/542/5428353.jpg?1'
    });
  });

  it('falls back to small icon, accepts nickname-only, and rejects unsafe or empty values', () => {
    expect(
      normalizeNicoUserProfileResponse({
        data: { user: { id: 7, nickname: 'A', icons: { small: 'https://x/y/7.jpg' } } }
      })?.avatarUrl
    ).toBe('https://x/y/7.jpg');
    expect(
      normalizeNicoUserProfileResponse({ data: { user: { id: 7, nickname: 'only-name' } } })
    ).toEqual({ userId: '7', nickname: 'only-name', avatarUrl: '' });
    expect(
      normalizeNicoUserProfileResponse({
        data: { user: { id: 7, nickname: 'A', icons: { large: 'javascript:alert(1)' } } }
      })?.avatarUrl
    ).toBe('');
    expect(normalizeNicoUserProfileResponse({ data: { user: { id: 0, nickname: 'x' } } })).toBeNull();
    expect(normalizeNicoUserProfileResponse({ data: { user: { id: 7 } } })).toBeNull();
    expect(normalizeNicoUserProfileResponse({ meta: { status: 500 } })).toBeNull();
  });

  it('拡張: LV / プレミアム / フォロー / フォロワー を取得できたら付与する', () => {
    const p = normalizeNicoUserProfileResponse({
      data: {
        followeeCount: 12,
        followerCount: 3400,
        user: {
          id: 7,
          nickname: 'A',
          isPremium: true,
          userLevel: { currentLevel: 55 }
        }
      }
    });
    expect(p).toMatchObject({
      userId: '7',
      nickname: 'A',
      level: 55,
      isPremium: true,
      followeeCount: 12,
      followerCount: 3400
    });
  });

  it('拡張: 拡張項目が無い場合は従来の3キーのみ（後方互換）', () => {
    const p = normalizeNicoUserProfileResponse({
      data: { user: { id: 7, nickname: 'only-name' } }
    });
    expect(p).toEqual({ userId: '7', nickname: 'only-name', avatarUrl: '' });
  });
});

describe('公式プロフィールの全項目(v0.1.1670)', () => {
  const REAL = { meta: { status: 200 }, data: { user: {
  id: 144967552, nickname: '鈴木働かない',
  icons: { small: 'https://img.nicoprofile.nimg.jp/usericon/14496/144967552.jpg?1', large: 'https://img.nicoprofile.nimg.jp/usericon/14496/144967552.jpg?1' },
  description: '切り抜きはメンションお願いします‼️<br><br>ほしりす<br><a href="https://www.amazon.co.jp/hz/wishlist/ls/X">https://www.amazon.co.jp/hz/wishlist/ls/X</a>',
  strippedDescription: '切り抜きはメンションお願いします‼️\n\n\nほしりす\nhttps://www.amazon.co.jp/hz/wishlist/ls/X',
  isPremium: true, registeredVersion: '(to i)', followeeCount: 0, followerCount: 4593,
  userLevel: { currentLevel: 56, nextLevelThresholdExperience: 11500, nextLevelExperience: 243300, currentLevelExperience: 6020 },
  sns: [
    { type: 'twitter', label: 'X', screenName: 'majinojob3150', url: 'https://x.com/majinojob3150' },
    { type: 'youtube', label: 'YouTube', screenName: '@majinojob', url: 'https://www.youtube.com/@majinojob' },
    { type: 'bad', label: 'bad', screenName: 'x', url: 'javascript:alert(1)' }
  ]
} } };
  it('★自己紹介・SNS・経験値を取り出す(実際の公式の応答の形)', () => {
    const p = normalizeNicoUserProfileResponse(REAL);
    expect(p.nickname).toBe('鈴木働かない');
    expect(p.level).toBe(56);
    expect(p.followerCount).toBe(4593);
    expect(p.description).toContain('切り抜きはメンションお願いします');
    expect(p.description).not.toContain('<');
    expect(p.levelExp).toEqual({ current: 6020, threshold: 11500 });
  });
  it('★SNS は http(s) だけ。javascript: は捨てる', () => {
    const p = normalizeNicoUserProfileResponse(REAL);
    expect(p.sns.map((s) => s.label)).toEqual(['X', 'YouTube']);
    expect(p.sns[0]).toEqual({ label: 'X', screenName: 'majinojob3150', url: 'https://x.com/majinojob3150' });
  });
  it('項目が無い応答でも例外にならない(従来の形のまま)', () => {
    const p = normalizeNicoUserProfileResponse({ meta: { status: 200 }, data: { user: { id: 1, nickname: 'a', icons: {} } } });
    expect(p.nickname).toBe('a');
    expect(p.description).toBeUndefined();
    expect(p.sns).toBeUndefined();
  });
});
