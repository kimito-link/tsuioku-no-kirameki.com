/**
 * v0.1.203 Patch 1: deriveAvatarUrlFromUid / extractUidFromAvatarUrl /
 * pickAvatarUrlForUid のテスト。
 *
 * 確定パターン: https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/<UID/10000>/<UID>.jpg
 */

import { describe, it, expect } from 'vitest';
import {
  deriveAvatarUrlFromUid,
  extractUidFromAvatarUrl,
  pickAvatarUrlForUid
} from './deriveAvatarUrlFromUid.js';

describe('deriveAvatarUrlFromUid', () => {
  it('実機で観測した uid から正しい URL（lv350471922 の broadcaster）', () => {
    expect(deriveAvatarUrlFromUid(143172392)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14317/143172392.jpg'
    );
  });

  it('実機の uid (2913665、hara さん) から正しい URL', () => {
    expect(deriveAvatarUrlFromUid(2913665)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/291/2913665.jpg'
    );
  });

  it('小さい uid（10000 未満）→ ディレクトリ番号 0', () => {
    expect(deriveAvatarUrlFromUid(99)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/99.jpg'
    );
  });

  it('文字列 uid でも動く', () => {
    expect(deriveAvatarUrlFromUid('143172392')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14317/143172392.jpg'
    );
  });

  it('size=m で中サイズ URL', () => {
    expect(deriveAvatarUrlFromUid(2913665, 'm')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/m/291/2913665.jpg'
    );
  });

  it('null/undefined/空文字/負数/NaN/小数 → 空文字', () => {
    expect(deriveAvatarUrlFromUid(null)).toBe('');
    expect(deriveAvatarUrlFromUid(undefined)).toBe('');
    expect(deriveAvatarUrlFromUid('')).toBe('');
    expect(deriveAvatarUrlFromUid(-1)).toBe('');
    expect(deriveAvatarUrlFromUid(NaN)).toBe('');
    expect(deriveAvatarUrlFromUid(1.5)).toBe('');
  });

  it('「a:」始まりや非数字 uid（NDGR 匿名）は空文字', () => {
    expect(deriveAvatarUrlFromUid('a:H2u6e6h6KhD')).toBe('');
    expect(deriveAvatarUrlFromUid('u/12345')).toBe('');
  });
});

describe('extractUidFromAvatarUrl', () => {
  it('実機 URL から UID を抽出', () => {
    expect(
      extractUidFromAvatarUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/291/2913665.jpg'
      )
    ).toBe('2913665');
  });

  it('m サイズも対応', () => {
    expect(
      extractUidFromAvatarUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/m/14317/143172392.jpg'
      )
    ).toBe('143172392');
  });

  it('jpg 以外（png/gif）も扱う', () => {
    expect(
      extractUidFromAvatarUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/99.png'
      )
    ).toBe('99');
  });

  it('パターン外 URL → null', () => {
    expect(extractUidFromAvatarUrl('https://example.com/foo.jpg')).toBeNull();
    expect(extractUidFromAvatarUrl(null)).toBeNull();
    expect(extractUidFromAvatarUrl('')).toBeNull();
  });
});

describe('pickAvatarUrlForUid', () => {
  it('intercept にあれば intercept を優先', () => {
    const map = new Map([['2913665', 'https://intercept-cache/2913665.jpg']]);
    expect(pickAvatarUrlForUid(2913665, map)).toBe(
      'https://intercept-cache/2913665.jpg'
    );
  });

  it('intercept になければ生成 URL', () => {
    const map = new Map();
    expect(pickAvatarUrlForUid(2913665, map)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/291/2913665.jpg'
    );
  });

  it('intercept が plain object でも動く', () => {
    const obj = { '2913665': 'https://intercept-cache/2913665.jpg' };
    expect(pickAvatarUrlForUid(2913665, obj)).toBe(
      'https://intercept-cache/2913665.jpg'
    );
  });

  it('intercept null/undefined でも生成 URL を返す', () => {
    expect(pickAvatarUrlForUid(2913665, null)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/291/2913665.jpg'
    );
    expect(pickAvatarUrlForUid(2913665, undefined)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/291/2913665.jpg'
    );
  });

  it('uid 無効なら空文字', () => {
    expect(pickAvatarUrlForUid('a:abc', null)).toBe('');
  });
});
