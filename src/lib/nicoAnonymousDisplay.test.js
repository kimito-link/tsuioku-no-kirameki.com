import { describe, it, expect } from 'vitest';
import {
  isNiconicoAnonymousUserId,
  isNiconicoHashedAnonymousUserId,
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

// v0.1.1558: タイムシフトの匿名 hashedUserId は a: 接頭辞が無い（lv342383970 実測 417/442 件）。
describe('isNiconicoHashedAnonymousUserId (v0.1.1558)', () => {
  it('タイムシフト実値 27 文字 base64url は匿名（sIEHqCaHKR_Pe1v1ZU61TnVABv8）', () => {
    expect(isNiconicoHashedAnonymousUserId('sIEHqCaHKR_Pe1v1ZU61TnVABv8')).toBe(true);
    expect(isNiconicoHashedAnonymousUserId('D1y2Kzu3dKqQVAC9v1a7WfLDbPk')).toBe(true);
  });
  it('先頭が - の 20 文字も匿名（-GGaQpHQUTGLRnNRYU1_）', () => {
    expect(isNiconicoHashedAnonymousUserId('-GGaQpHQUTGLRnNRYU1_')).toBe(true);
  });
  it('数値 uid(14014777) は匿名でない', () => {
    expect(isNiconicoHashedAnonymousUserId('14014777')).toBe(false);
    expect(isNiconicoHashedAnonymousUserId('1234567890123456')).toBe(false);
  });
  it('内部キー __anon_ad_2 / __gift_sender_x は匿名でない', () => {
    expect(isNiconicoHashedAnonymousUserId('__anon_ad_2')).toBe(false);
    expect(isNiconicoHashedAnonymousUserId('__gift_sender_abcdefghijk')).toBe(false);
  });
  it('16 文字未満（ch2640322）・41 文字以上・日本語・a: 形・空は hashed 判定では false', () => {
    expect(isNiconicoHashedAnonymousUserId('ch2640322')).toBe(false);
    expect(isNiconicoHashedAnonymousUserId('abcdefghijklmno')).toBe(false); // 15
    expect(isNiconicoHashedAnonymousUserId('x'.repeat(41))).toBe(false);
    expect(isNiconicoHashedAnonymousUserId('たぬ姉たぬ姉たぬ姉たぬ姉たぬ姉たぬ姉')).toBe(false);
    expect(isNiconicoHashedAnonymousUserId('a:AXaKZ_4ShxQHJVsX')).toBe(false);
    expect(isNiconicoHashedAnonymousUserId('')).toBe(false);
    expect(isNiconicoHashedAnonymousUserId(null)).toBe(false);
  });
});

describe('isNiconicoAnonymousUserId: hashed 形も匿名（a: 規則は不変）', () => {
  it('hashed 27 文字は匿名', () => {
    expect(isNiconicoAnonymousUserId('sIEHqCaHKR_Pe1v1ZU61TnVABv8')).toBe(true);
  });
  it('a: 形は従来どおり（本体 2 文字以上・大小無視）', () => {
    expect(isNiconicoAnonymousUserId('a:AXaKZ_4ShxQHJVsX')).toBe(true);
    expect(isNiconicoAnonymousUserId('A:XYZ')).toBe(true);
    expect(isNiconicoAnonymousUserId('a:x')).toBe(false);
  });
  it('数値・内部キー・短い ID は匿名でない', () => {
    expect(isNiconicoAnonymousUserId('14014777')).toBe(false);
    expect(isNiconicoAnonymousUserId('__anon_ad_2')).toBe(false);
    expect(isNiconicoAnonymousUserId('ch2640322')).toBe(false);
  });
});

describe('anonymousNicknameFallback: hashed', () => {
  it('hashed uid + nickname 空 → 「匿名」（a: と同じ）', () => {
    expect(anonymousNicknameFallback('sIEHqCaHKR_Pe1v1ZU61TnVABv8', '')).toBe('匿名');
    expect(anonymousNicknameFallback('sIEHqCaHKR_Pe1v1ZU61TnVABv8', 'ゲスト')).toBe('匿名');
  });
  it('数値 uid + nickname 空 → 空文字（0.1.181 の u/ 経路へ・不変）', () => {
    expect(anonymousNicknameFallback('14014777', '')).toBe('');
  });
});
