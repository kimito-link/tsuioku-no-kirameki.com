import { describe, it, expect } from 'vitest';
import {
  nicoUserPageUrl,
  isLinkableNicoUserId,
  anonymousDisplayLabel
} from './nicoUserPage.js';

describe('nicoUserPageUrl', () => {
  it('数値 userId は公開ページ URL を作る', () => {
    expect(nicoUserPageUrl('563676')).toBe('https://www.nicovideo.jp/user/563676');
    expect(nicoUserPageUrl(12345)).toBe('https://www.nicovideo.jp/user/12345');
  });

  it('前後空白を除去して判定する', () => {
    expect(nicoUserPageUrl('  563676  ')).toBe('https://www.nicovideo.jp/user/563676');
  });

  it('匿名(a:…)・数値でない・空・null は ""', () => {
    expect(nicoUserPageUrl('a:abc123')).toBe('');
    expect(nicoUserPageUrl('user_x')).toBe('');
    expect(nicoUserPageUrl('')).toBe('');
    expect(nicoUserPageUrl(null)).toBe('');
    expect(nicoUserPageUrl(undefined)).toBe('');
  });

  it('19桁以上の異常に長い ID はリンクを作らない(誤リンク防止)', () => {
    expect(nicoUserPageUrl('12345678901234567890')).toBe('');
  });
});

describe('isLinkableNicoUserId', () => {
  it('数値のみ true', () => {
    expect(isLinkableNicoUserId('563676')).toBe(true);
    expect(isLinkableNicoUserId('a:xyz')).toBe(false);
    expect(isLinkableNicoUserId('')).toBe(false);
    expect(isLinkableNicoUserId(null)).toBe(false);
  });
});

describe('anonymousDisplayLabel', () => {
  it('同じキーは常に同じラベル(描画ごとに変わらない)', () => {
    const a = anonymousDisplayLabel('a:abcdef');
    const b = anonymousDisplayLabel('a:abcdef');
    expect(a).toBe(b);
  });

  it('別キーは別ラベルになりやすい', () => {
    const a = anonymousDisplayLabel('a:aaa111');
    const b = anonymousDisplayLabel('a:bbb999');
    expect(a).not.toBe(b);
  });

  it('「匿名」+数字 の形になる', () => {
    expect(anonymousDisplayLabel('a:00000123')).toMatch(/^匿名\d{1,3}$/);
    expect(anonymousDisplayLabel('名無しさん')).toMatch(/^匿名\d{1,3}$/);
    expect(anonymousDisplayLabel('')).toMatch(/^匿名\d{1,3}$/);
  });

  it('数字を含むキーは末尾3桁ベースで番号化する', () => {
    expect(anonymousDisplayLabel('a:99999456')).toBe('匿名456');
  });
});
