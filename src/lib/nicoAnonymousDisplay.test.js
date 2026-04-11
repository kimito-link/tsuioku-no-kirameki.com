import { describe, it, expect } from 'vitest';
import {
  isNiconicoAnonymousUserId,
  anonymousNicknameFallback,
  compactNicoLaneUserId,
  isNiconicoAutoUserPlaceholderNickname
} from './nicoAnonymousDisplay.js';

describe('nicoAnonymousDisplay', () => {
  it('isNiconicoAnonymousUserId', () => {
    expect(isNiconicoAnonymousUserId('')).toBe(false);
    expect(isNiconicoAnonymousUserId('12345')).toBe(false);
    expect(isNiconicoAnonymousUserId('a:')).toBe(false);
    expect(isNiconicoAnonymousUserId('a:x')).toBe(false);
    expect(isNiconicoAnonymousUserId('a:AXaKZ_4ShxQHJVsX')).toBe(true);
    expect(isNiconicoAnonymousUserId('  a:abcd12  ')).toBe(true);
  });

  it('anonymousNicknameFallback', () => {
    expect(anonymousNicknameFallback('a:xx', '')).toBe('匿名');
    expect(anonymousNicknameFallback('a:xx', '  ')).toBe('匿名');
    expect(anonymousNicknameFallback('a:xx', 'nora')).toBe('nora');
    expect(anonymousNicknameFallback('999', '')).toBe('');
    expect(anonymousNicknameFallback('999', '太郎')).toBe('太郎');
  });

  it('isNiconicoAutoUserPlaceholderNickname', () => {
    expect(isNiconicoAutoUserPlaceholderNickname('')).toBe(false);
    expect(isNiconicoAutoUserPlaceholderNickname('user')).toBe(false);
    expect(isNiconicoAutoUserPlaceholderNickname('user 0539Z74OJ13')).toBe(true);
    expect(isNiconicoAutoUserPlaceholderNickname('USER  abc12')).toBe(true);
    expect(isNiconicoAutoUserPlaceholderNickname('たろう')).toBe(false);
    expect(isNiconicoAutoUserPlaceholderNickname('user_name')).toBe(false);
  });

  it('compactNicoLaneUserId', () => {
    expect(compactNicoLaneUserId('141872772')).toBe('141872772');
    expect(compactNicoLaneUserId('a:u2w_cQ5FUwkLARpz')).toBe('a:u2w_…');
    expect(compactNicoLaneUserId('a:short')).toBe('a:short');
    expect(compactNicoLaneUserId('abcdefghijklmnop')).toBe('abcde…nop');
  });
});
