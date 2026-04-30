import { describe, it, expect } from 'vitest';
import {
  isNiconicoAnonymousUserId,
  anonymousNicknameFallback,
  compactNicoLaneUserId,
  isNiconicoAutoUserPlaceholderNickname,
  isNiconicoGuestPlaceholderNickname
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

  /*
   * 0.1.13 (I): ニコ既定の表示名「ゲスト」（数値 ID ユーザーがハンドル名を
   *   未設定のときの placeholder）はハンドルネームとして扱わない。「user xxxxx」
   *   と同じ運用：個人特定の補助にならず、レポートで「ゲスト（123456）」と表示
   *   されるとハンドルがあるかのように見えてしまうので、空文字に潰す。
   */
  it('anonymousNicknameFallback: ゲスト（既定 placeholder）は空扱い → ID のみ', () => {
    expect(anonymousNicknameFallback('144049418', 'ゲスト')).toBe('');
    expect(anonymousNicknameFallback('144049418', '  ゲスト  ')).toBe('');
    expect(anonymousNicknameFallback('144049418', 'ゲスト ')).toBe('');
  });

  it('anonymousNicknameFallback: 「ゲスト さん」「ゲスト123」のような派生は実名扱い（カスタム可能）', () => {
    expect(anonymousNicknameFallback('144049418', 'ゲスト123')).toBe('ゲスト123');
    expect(anonymousNicknameFallback('144049418', 'ゲストさん')).toBe('ゲストさん');
  });

  it('anonymousNicknameFallback: 匿名 a: + nickname=「ゲスト」は「匿名」になる', () => {
    expect(anonymousNicknameFallback('a:abcd', 'ゲスト')).toBe('匿名');
  });

  it('anonymousNicknameFallback: 「user XXXX」placeholder も空扱い → ID のみ', () => {
    expect(anonymousNicknameFallback('144049418', 'user 0539Z74OJ13')).toBe('');
    expect(anonymousNicknameFallback('144049418', 'USER abc12')).toBe('');
  });

  it('isNiconicoAutoUserPlaceholderNickname', () => {
    expect(isNiconicoAutoUserPlaceholderNickname('')).toBe(false);
    expect(isNiconicoAutoUserPlaceholderNickname('user')).toBe(false);
    expect(isNiconicoAutoUserPlaceholderNickname('user 0539Z74OJ13')).toBe(true);
    expect(isNiconicoAutoUserPlaceholderNickname('USER  abc12')).toBe(true);
    expect(isNiconicoAutoUserPlaceholderNickname('たろう')).toBe(false);
    expect(isNiconicoAutoUserPlaceholderNickname('user_name')).toBe(false);
  });

  it('isNiconicoGuestPlaceholderNickname', () => {
    expect(isNiconicoGuestPlaceholderNickname('')).toBe(false);
    expect(isNiconicoGuestPlaceholderNickname('ゲスト')).toBe(true);
    expect(isNiconicoGuestPlaceholderNickname('  ゲスト ')).toBe(true);
    expect(isNiconicoGuestPlaceholderNickname('ゲストさん')).toBe(false);
    expect(isNiconicoGuestPlaceholderNickname('ゲスト123')).toBe(false);
    expect(isNiconicoGuestPlaceholderNickname('かんぺい')).toBe(false);
    expect(isNiconicoGuestPlaceholderNickname(null)).toBe(false);
    expect(isNiconicoGuestPlaceholderNickname(undefined)).toBe(false);
  });

  it('compactNicoLaneUserId', () => {
    expect(compactNicoLaneUserId('141872772')).toBe('141872772');
    expect(compactNicoLaneUserId('a:u2w_cQ5FUwkLARpz')).toBe('a:u2w_…');
    expect(compactNicoLaneUserId('a:short')).toBe('a:short');
    expect(compactNicoLaneUserId('abcdefghijklmnop')).toBe('abcde…nop');
  });
});
