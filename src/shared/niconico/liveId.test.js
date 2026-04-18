/**
 * shared/niconico/liveId.js の契約テスト。
 *
 * この関数は表示用ではなく「比較用のキー」を作る。
 * 変換後の文字列は常に小文字 + `lv` 接頭辞で始まる or 空文字のどちらか。
 */

import { describe, expect, it } from 'vitest';
import { normalizeLv } from './liveId.js';

describe('normalizeLv', () => {
  it('null / undefined / 空文字 / 空白 は空文字', () => {
    expect(normalizeLv(null)).toBe('');
    expect(normalizeLv(undefined)).toBe('');
    expect(normalizeLv('')).toBe('');
    expect(normalizeLv('   ')).toBe('');
  });

  it('lv 接頭辞あり → 小文字化のみ', () => {
    expect(normalizeLv('lv1234')).toBe('lv1234');
    expect(normalizeLv('LV1234')).toBe('lv1234');
    expect(normalizeLv('Lv1234')).toBe('lv1234');
  });

  it('lv 接頭辞なし → lv を付ける', () => {
    expect(normalizeLv('1234')).toBe('lv1234');
    expect(normalizeLv(1234)).toBe('lv1234');
  });

  it('前後空白は trim', () => {
    expect(normalizeLv('  lv1234  ')).toBe('lv1234');
  });

  it('数値入力も OK', () => {
    expect(normalizeLv(42)).toBe('lv42');
  });
});
