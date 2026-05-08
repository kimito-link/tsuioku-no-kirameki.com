import { describe, it, expect } from 'vitest';
import {
  generateNlsAuthToken,
  isNlsInterceptTokenValid,
  isValidChatRow,
  isValidGiftUser,
  isValidCommentPostBody,
  sanitizeIncomingArray,
  NLS_INTERCEPT_MAX_ARRAY_LEN,
  NLS_INTERCEPT_MAX_STRING_LEN
} from './nlsInterceptAuth.js';

describe('generateNlsAuthToken', () => {
  it('hex 32 文字列を返す', () => {
    const t = generateNlsAuthToken();
    expect(typeof t).toBe('string');
    expect(t.length).toBe(32);
    expect(/^[0-9a-f]{32}$/.test(t)).toBe(true);
  });

  it('複数回呼ぶと別の値', () => {
    const a = generateNlsAuthToken();
    const b = generateNlsAuthToken();
    expect(a).not.toBe(b);
  });
});

describe('isNlsInterceptTokenValid', () => {
  it('一致する token → true', () => {
    expect(
      isNlsInterceptTokenValid({ data: { type: 'X', _token: 'abc' } }, 'abc')
    ).toBe(true);
  });
  it('不一致 token → false', () => {
    expect(
      isNlsInterceptTokenValid({ data: { type: 'X', _token: 'abc' } }, 'xyz')
    ).toBe(false);
  });
  it('token 欠落 → false', () => {
    expect(isNlsInterceptTokenValid({ data: { type: 'X' } }, 'abc')).toBe(false);
  });
  it('expectedToken が空 → false（auth 未設定の安全側）', () => {
    expect(
      isNlsInterceptTokenValid({ data: { type: 'X', _token: 'abc' } }, '')
    ).toBe(false);
  });
  it('null / 異常入力 → false', () => {
    expect(isNlsInterceptTokenValid(null, 'abc')).toBe(false);
    expect(isNlsInterceptTokenValid(undefined, 'abc')).toBe(false);
    expect(isNlsInterceptTokenValid({ data: 'string' }, 'abc')).toBe(false);
  });
});

describe('isValidChatRow', () => {
  it('正常 row → true', () => {
    expect(isValidChatRow({ commentNo: '123', text: 'こんにちは', userId: '99999' })).toBe(true);
  });
  it('userId なしでも text あれば OK', () => {
    expect(isValidChatRow({ commentNo: '123', text: 'こんにちは' })).toBe(true);
  });
  it('commentNo が桁数オーバー → false', () => {
    expect(isValidChatRow({ commentNo: '12345678901', text: 'x' })).toBe(false);
  });
  it('commentNo が非数字 → false', () => {
    expect(isValidChatRow({ commentNo: 'abc', text: 'x' })).toBe(false);
  });
  it('text が長すぎる → false', () => {
    const long = 'a'.repeat(NLS_INTERCEPT_MAX_STRING_LEN + 1);
    expect(isValidChatRow({ commentNo: '1', text: long })).toBe(false);
  });
  it('userId に変な文字 → false', () => {
    expect(isValidChatRow({ commentNo: '1', text: 'x', userId: '<script>' })).toBe(false);
  });
  it('null / 非オブジェクト → false', () => {
    expect(isValidChatRow(null)).toBe(false);
    expect(isValidChatRow('row')).toBe(false);
  });
});

describe('isValidGiftUser', () => {
  it('正常 user → true', () => {
    expect(isValidGiftUser({ userId: '12345', nickname: 'テスト', point: 300 })).toBe(true);
  });
  it('anonymous gift（userId 空）→ true', () => {
    expect(isValidGiftUser({ userId: '', nickname: '名無し', point: 100 })).toBe(true);
  });
  it('nickname / point なしでも → true（最低限 object チェックのみ）', () => {
    expect(isValidGiftUser({ userId: '12345' })).toBe(true);
  });
  it('point が負 → false', () => {
    expect(isValidGiftUser({ userId: '12345', point: -1 })).toBe(false);
  });
  it('point が非数 → false', () => {
    expect(isValidGiftUser({ userId: '12345', point: 'spoofed' })).toBe(false);
  });
  it('itemName が長すぎ → false', () => {
    const long = 'a'.repeat(257);
    expect(isValidGiftUser({ userId: '12345', itemName: long })).toBe(false);
  });
  it('userId に変な文字 → false', () => {
    expect(isValidGiftUser({ userId: '<bad>', nickname: 'x' })).toBe(false);
  });
});

describe('isValidCommentPostBody', () => {
  it('正常 → true', () => {
    expect(isValidCommentPostBody({ no: '1', body: 'こんにちは', userId: '99' })).toBe(true);
  });
  it('no 欠落 → false', () => {
    expect(isValidCommentPostBody({ body: 'x' })).toBe(false);
  });
  it('text 欠落 → false', () => {
    expect(isValidCommentPostBody({ no: '1' })).toBe(false);
  });
});

describe('sanitizeIncomingArray', () => {
  it('正常配列で valid 要素のみ', () => {
    const r = sanitizeIncomingArray(
      [
        { commentNo: '1', text: 'a' },
        { commentNo: 'bad', text: 'b' }, // invalid
        { commentNo: '2', text: 'c' }
      ],
      isValidChatRow
    );
    expect(r).toHaveLength(2);
  });
  it('上限超え → null', () => {
    const huge = Array.from({ length: NLS_INTERCEPT_MAX_ARRAY_LEN + 1 }, (_, i) => ({
      commentNo: String(i + 1),
      text: 'x'
    }));
    expect(sanitizeIncomingArray(huge, isValidChatRow)).toBeNull();
  });
  it('空配列 → null', () => {
    expect(sanitizeIncomingArray([], isValidChatRow)).toBeNull();
  });
  it('全 invalid → null', () => {
    const r = sanitizeIncomingArray(
      [{ commentNo: 'bad' }, { commentNo: 'also-bad' }],
      isValidChatRow
    );
    expect(r).toBeNull();
  });
  it('null 入力 → null', () => {
    expect(sanitizeIncomingArray(null, isValidChatRow)).toBeNull();
  });
});
