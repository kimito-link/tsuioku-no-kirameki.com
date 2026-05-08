import { describe, expect, it } from 'vitest';
import { isStatValuePlaceholderText } from './liveStatValuePlaceholder.js';

describe('isStatValuePlaceholderText', () => {
  it('空・ダッシュ系はプレースホルダー', () => {
    expect(isStatValuePlaceholderText('')).toBe(true);
    expect(isStatValuePlaceholderText('—')).toBe(true);
    expect(isStatValuePlaceholderText('-')).toBe(true);
    expect(isStatValuePlaceholderText('（取得不可）')).toBe(true);
  });

  it('整数・カンマ区切り・先頭~は数値扱い', () => {
    expect(isStatValuePlaceholderText('193')).toBe(false);
    expect(isStatValuePlaceholderText('1,234')).toBe(false);
    expect(isStatValuePlaceholderText('1，234')).toBe(false);
    expect(isStatValuePlaceholderText('~112')).toBe(false);
  });
});
