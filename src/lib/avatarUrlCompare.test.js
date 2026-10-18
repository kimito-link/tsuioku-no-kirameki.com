/**
 * avatarUrlCompare のテスト。
 *
 * 0.1.39: popup-entry.js から avatarCompareKey / isSameAvatarUrl を切り出し。
 *   ニコ生 CDN の usericon URL は同一画像でもクエリ（?cache_buster, ?v=）や
 *   hash で変わってくることがある。これらは「同じアバター」と扱いたいので、
 *   query / hash を除去した URL を比較キーとして使う。
 */

import { describe, it, expect } from 'vitest';
import { avatarCompareKey, isSameAvatarUrl } from './avatarUrlCompare.js';

describe('avatarCompareKey', () => {
  it('普通の URL は href をそのまま返す（trailing slash 等は URL ルールで正規化）', () => {
    expect(avatarCompareKey(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/13426/134268998.jpg'
    )).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/13426/134268998.jpg'
    );
  });

  it('?query を取り除く', () => {
    expect(avatarCompareKey(
      'https://example.com/icon.jpg?v=12345'
    )).toBe('https://example.com/icon.jpg');
  });

  it('#hash を取り除く', () => {
    expect(avatarCompareKey(
      'https://example.com/icon.jpg#frag'
    )).toBe('https://example.com/icon.jpg');
  });

  it('?query + #hash 両方取り除く', () => {
    expect(avatarCompareKey(
      'https://example.com/icon.jpg?cache=1#frag'
    )).toBe('https://example.com/icon.jpg');
  });

  it('空文字 / null / undefined → 空文字', () => {
    expect(avatarCompareKey('')).toBe('');
    expect(avatarCompareKey(null)).toBe('');
    expect(avatarCompareKey(undefined)).toBe('');
  });

  it('URL として解釈できない文字列は trim した raw を返す', () => {
    expect(avatarCompareKey('not a url')).toBe('not a url');
    expect(avatarCompareKey('  spaces  ')).toBe('spaces');
  });

  it('data: URL もそのまま href で返す（query/hash 無いので）', () => {
    const dataUrl = 'data:image/png;base64,AAAA';
    expect(avatarCompareKey(dataUrl)).toBe(dataUrl);
  });
});

describe('isSameAvatarUrl', () => {
  it('完全一致 → true', () => {
    const u = 'https://example.com/a.jpg';
    expect(isSameAvatarUrl(u, u)).toBe(true);
  });

  it('クエリ違いのみ → 同じ扱い', () => {
    expect(isSameAvatarUrl(
      'https://example.com/a.jpg?v=1',
      'https://example.com/a.jpg?v=2'
    )).toBe(true);
  });

  it('hash 違いのみ → 同じ扱い', () => {
    expect(isSameAvatarUrl(
      'https://example.com/a.jpg#a',
      'https://example.com/a.jpg#b'
    )).toBe(true);
  });

  it('パス違い → false', () => {
    expect(isSameAvatarUrl(
      'https://example.com/a.jpg',
      'https://example.com/b.jpg'
    )).toBe(false);
  });

  it('片方が空 → false', () => {
    expect(isSameAvatarUrl('', 'https://example.com/a.jpg')).toBe(false);
    expect(isSameAvatarUrl('https://example.com/a.jpg', '')).toBe(false);
    expect(isSameAvatarUrl('', '')).toBe(false);
  });

  it('null/undefined を渡しても throw しない', () => {
    expect(isSameAvatarUrl(null, undefined)).toBe(false);
    // @ts-expect-error - test runtime safety
    expect(isSameAvatarUrl(null, null)).toBe(false);
  });

  it('host 違い → false（クエリは除去されてもホストは保持）', () => {
    expect(isSameAvatarUrl(
      'https://a.example.com/icon.jpg?v=1',
      'https://b.example.com/icon.jpg?v=1'
    )).toBe(false);
  });
});

describe('avatarCompareKey の記憶(v0.1.1677・同じURLで URL を作り直さない)', () => {
  /** @param {() => void} fn @returns {number} その間に new URL が呼ばれた回数 */
  const countUrlConstructions = (fn) => {
    const Orig = globalThis.URL;
    let n = 0;
    globalThis.URL = /** @type {any} */ (
      class extends Orig {
        /** @param {any[]} a */
        constructor(...a) {
          // @ts-expect-error - テスト用の計数(引数は素通し)
          super(...a);
          n += 1;
        }
      }
    );
    try {
      fn();
    } finally {
      globalThis.URL = Orig;
    }
    return n;
  };

  it('★同じ文字列を何度渡しても URL の解析は1回だけ(全コメントぶん呼ばれる経路の CPU 対策)', () => {
    const u = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg?1700000000';
    const n = countUrlConstructions(() => {
      for (let i = 0; i < 500; i += 1) avatarCompareKey(u);
    });
    expect(n).toBeLessThanOrEqual(1);
  });

  it('★記憶しても答えは同じ(初回と2回目以降・クエリ違いは同じキー)', () => {
    const a = 'https://example.com/i/9.jpg?v=1#x';
    const first = avatarCompareKey(a);
    expect(avatarCompareKey(a)).toBe(first);
    expect(first).toBe('https://example.com/i/9.jpg');
    expect(avatarCompareKey('https://example.com/i/9.jpg?v=2')).toBe(first);
  });

  it('★解析できない文字列は、そのまま返す答えも変わらない(失敗を記憶しても同じ)', () => {
    expect(avatarCompareKey('not a url')).toBe('not a url');
    expect(avatarCompareKey('not a url')).toBe('not a url');
  });

  it('★空・null は常に空(記憶に入れない)', () => {
    expect(avatarCompareKey('')).toBe('');
    expect(avatarCompareKey('   ')).toBe('');
    expect(avatarCompareKey(null)).toBe('');
  });

  it('★大量の別URLでも壊れない・古い記憶を捨てても答えは同じ', () => {
    const keep = 'https://example.com/keep.jpg?z=1';
    const want = avatarCompareKey(keep);
    for (let i = 0; i < 6000; i += 1) avatarCompareKey(`https://example.com/u/${i}.jpg?v=${i}`);
    expect(avatarCompareKey(keep)).toBe(want);
    expect(avatarCompareKey('https://example.com/u/17.jpg?v=3')).toBe('https://example.com/u/17.jpg');
  });
});
