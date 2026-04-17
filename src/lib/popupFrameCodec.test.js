import { describe, it, expect } from 'vitest';
import {
  createFrameShareCode,
  decodeBase64UrlUtf8,
  encodeBase64UrlUtf8,
  parseFrameShareCode
} from './popupFrameCodec.js';
import { DEFAULT_CUSTOM_FRAME } from './popupFramePresets.js';

describe('encode/decodeBase64UrlUtf8', () => {
  it('ASCII 文字列の往復', () => {
    const encoded = encodeBase64UrlUtf8('hello world');
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(decodeBase64UrlUtf8(encoded)).toBe('hello world');
  });

  it('UTF-8（日本語）文字列の往復', () => {
    const input = 'カスタム配色 #1';
    const encoded = encodeBase64UrlUtf8(input);
    expect(decodeBase64UrlUtf8(encoded)).toBe(input);
  });

  it('パディング（=）が除去されている', () => {
    // "ab" の base64 は "YWI=" → url 化で "YWI" になる
    expect(encodeBase64UrlUtf8('ab')).toBe('YWI');
  });

  it('`+` `/` はそれぞれ `-` `_` に置換される', () => {
    // 0xFB→'+', 0xFF→'/' などが出現する入力
    const bytes = String.fromCharCode(0xfb, 0xef, 0xff);
    const encoded = encodeBase64UrlUtf8(bytes);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });

  it('デコード時にパディングを再付与する', () => {
    // パディング無しでもデコード可能
    const padded = btoa('abc').replace(/\+/g, '-').replace(/\//g, '_');
    const stripped = padded.replace(/=+$/g, '');
    expect(decodeBase64UrlUtf8(stripped)).toBe('abc');
  });

  it('空文字もデコードできる（空文字を返す）', () => {
    expect(decodeBase64UrlUtf8('')).toBe('');
  });
});

describe('createFrameShareCode', () => {
  it('nlsframe. プレフィックス + base64url を返す', () => {
    const code = createFrameShareCode('light', DEFAULT_CUSTOM_FRAME);
    expect(code.startsWith('nlsframe.')).toBe(true);
    expect(code.slice('nlsframe.'.length)).not.toMatch(/[+/=]/);
  });

  it('ペイロードは { v:1, frame, custom } を含む', () => {
    const code = createFrameShareCode('dark', DEFAULT_CUSTOM_FRAME);
    const payload = JSON.parse(
      decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    );
    expect(payload.v).toBe(1);
    expect(payload.frame).toBe('dark');
    expect(payload.custom).toEqual(DEFAULT_CUSTOM_FRAME);
  });

  it('legacy alias は現行 ID に正規化される', () => {
    const code = createFrameShareCode('trio', DEFAULT_CUSTOM_FRAME);
    const payload = JSON.parse(
      decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    );
    expect(payload.frame).toBe('light');
  });

  it('未知 ID は DEFAULT（light）に正規化', () => {
    const code = createFrameShareCode('nope', DEFAULT_CUSTOM_FRAME);
    const payload = JSON.parse(
      decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    );
    expect(payload.frame).toBe('light');
  });

  it('custom frame の 3 色は sanitize 済で埋め込まれる', () => {
    const code = createFrameShareCode('custom', {
      headerStart: '#112233',
      headerEnd: '#445566',
      accent: '#778899'
    });
    const payload = JSON.parse(
      decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    );
    expect(payload.frame).toBe('custom');
    expect(payload.custom).toEqual({
      headerStart: '#112233',
      headerEnd: '#445566',
      accent: '#778899'
    });
  });

  it('custom frame で不正値が来ても sanitize される', () => {
    const code = createFrameShareCode('custom', {
      // @ts-expect-error 意図的に不正値
      headerStart: 'nope',
      // @ts-expect-error
      headerEnd: null,
      // @ts-expect-error
      accent: 42
    });
    const payload = JSON.parse(
      decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    );
    expect(payload.custom).toEqual(DEFAULT_CUSTOM_FRAME);
  });
});

describe('parseFrameShareCode', () => {
  it('create → parse で往復できる（プリセット）', () => {
    const code = createFrameShareCode('sunset', DEFAULT_CUSTOM_FRAME);
    const parsed = parseFrameShareCode(code);
    expect(parsed.frameId).toBe('sunset');
    expect(parsed.custom).toEqual(DEFAULT_CUSTOM_FRAME);
  });

  it('create → parse で往復できる（custom）', () => {
    const custom = {
      headerStart: '#112233',
      headerEnd: '#445566',
      accent: '#778899'
    };
    const code = createFrameShareCode('custom', custom);
    const parsed = parseFrameShareCode(code);
    expect(parsed.frameId).toBe('custom');
    expect(parsed.custom).toEqual(custom);
  });

  it('生 JSON（nlsframe. なし）も互換で受け付ける', () => {
    const json = JSON.stringify({
      v: 1,
      frame: 'dark',
      custom: DEFAULT_CUSTOM_FRAME
    });
    const parsed = parseFrameShareCode(json);
    expect(parsed.frameId).toBe('dark');
    expect(parsed.custom).toEqual(DEFAULT_CUSTOM_FRAME);
  });

  it('legacy alias も parse 時に現行 ID に正規化される', () => {
    const json = JSON.stringify({
      v: 1,
      frame: 'konta',
      custom: DEFAULT_CUSTOM_FRAME
    });
    const parsed = parseFrameShareCode(json);
    expect(parsed.frameId).toBe('sunset');
  });

  it('未知 frame は DEFAULT にフォールバック', () => {
    const json = JSON.stringify({
      v: 1,
      frame: 'does-not-exist',
      custom: DEFAULT_CUSTOM_FRAME
    });
    const parsed = parseFrameShareCode(json);
    expect(parsed.frameId).toBe('light');
  });

  it('custom が欠損していても sanitize されて DEFAULT が入る', () => {
    const json = JSON.stringify({ v: 1, frame: 'light' });
    const parsed = parseFrameShareCode(json);
    expect(parsed.custom).toEqual(DEFAULT_CUSTOM_FRAME);
  });

  it('空文字は throw', () => {
    expect(() => parseFrameShareCode('')).toThrow();
    expect(() => parseFrameShareCode('   ')).toThrow();
    // @ts-expect-error 意図的に null
    expect(() => parseFrameShareCode(null)).toThrow();
    // @ts-expect-error
    expect(() => parseFrameShareCode(undefined)).toThrow();
  });

  it('JSON として壊れている文字列は throw', () => {
    expect(() => parseFrameShareCode('not-json')).toThrow();
    expect(() => parseFrameShareCode('nlsframe.!!!')).toThrow();
  });

  it('payload が配列／プリミティブでも落ちずに DEFAULT 相当を返す', () => {
    // JSON として有効だが object じゃない（配列）ケース
    const parsed = parseFrameShareCode(JSON.stringify([1, 2, 3]));
    expect(parsed.frameId).toBe('light');
    expect(parsed.custom).toEqual(DEFAULT_CUSTOM_FRAME);
  });
});
