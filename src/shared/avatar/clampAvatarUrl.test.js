/**
 * H2 / D-5: avatar URL の長さ上限を保存前に必ず適用するための共通 helper の契約。
 *
 * 0.1.10 で `commentRecord.createCommentEntry` には slice(0, 2000) を入れたが、
 * 既存行の patch 経路 (`patchExistingComment`)、プロファイルキャッシュ
 * (`userCommentProfileCache.normalizeUserCommentProfileMap`)、ギフトユーザー
 * (`mergeGiftUsers`) では未適用のままだった。同じロジックが散らばると drift する
 * ので、この helper を 1 source of truth として参照させる。
 */

import { describe, expect, it } from 'vitest';
import {
  AVATAR_URL_DEFAULT_MAX,
  clampAvatarUrl
} from './clampAvatarUrl.js';

describe('AVATAR_URL_DEFAULT_MAX', () => {
  it('既定の上限は 2000 文字（userCommentProfileCache.js の従来仕様と同じ）', () => {
    expect(AVATAR_URL_DEFAULT_MAX).toBe(2000);
  });
});

describe('clampAvatarUrl', () => {
  it('null / undefined / 空文字 → 空文字', () => {
    expect(clampAvatarUrl(null)).toBe('');
    expect(clampAvatarUrl(undefined)).toBe('');
    expect(clampAvatarUrl('')).toBe('');
    expect(clampAvatarUrl('   ')).toBe('');
  });

  it('数値 / boolean / object → 空文字（型ガード）', () => {
    expect(clampAvatarUrl(42)).toBe('');
    expect(clampAvatarUrl(true)).toBe('');
    expect(clampAvatarUrl({})).toBe('');
    expect(clampAvatarUrl([])).toBe('');
  });

  it('短い URL は trim 済みでそのまま返す', () => {
    expect(clampAvatarUrl('https://example.com/a.png')).toBe(
      'https://example.com/a.png'
    );
    expect(clampAvatarUrl('  https://example.com/a.png  ')).toBe(
      'https://example.com/a.png'
    );
  });

  it('既定上限 2000 文字を超えるものは slice する', () => {
    const long = 'https://example.com/' + 'x'.repeat(5000);
    const result = clampAvatarUrl(long);
    expect(result.length).toBe(2000);
    expect(result.startsWith('https://example.com/')).toBe(true);
  });

  it('境界: ちょうど 2000 文字はそのまま', () => {
    const exact = 'a'.repeat(2000);
    expect(clampAvatarUrl(exact)).toBe(exact);
    expect(clampAvatarUrl(exact).length).toBe(2000);
  });

  it('境界: 2001 文字は 2000 まで', () => {
    const overflow = 'a'.repeat(2001);
    expect(clampAvatarUrl(overflow).length).toBe(2000);
  });

  it('opts.max を指定すると別の上限で clamp する（テスト容易性）', () => {
    expect(clampAvatarUrl('a'.repeat(100), 50)).toHaveLength(50);
    expect(clampAvatarUrl('short', 50)).toBe('short');
  });

  it('opts.max が 0 や負数なら 0 文字（呼び出し側ミスを安全に検知）', () => {
    expect(clampAvatarUrl('any', 0)).toBe('');
    expect(clampAvatarUrl('any', -1)).toBe('');
  });

  it('opts.max が小数なら整数に丸める（floor）', () => {
    const s = 'a'.repeat(20);
    expect(clampAvatarUrl(s, 10.7)).toHaveLength(10);
  });

  it('入力が文字列でも前後の空白だけ除去（中の空白は保持）', () => {
    expect(clampAvatarUrl('  https://x/with space  ')).toBe('https://x/with space');
  });
});
