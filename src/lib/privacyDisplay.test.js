import { describe, it, expect } from 'vitest';
import { maskLabelForShare } from './privacyDisplay.js';

describe('maskLabelForShare', () => {
  it('空・ダッシュはそのまま', () => {
    expect(maskLabelForShare('')).toBe('');
    expect(maskLabelForShare('—')).toBe('—');
  });

  it('短い文字列は伏せ字のみ', () => {
    expect(maskLabelForShare('ab')).toBe('••');
    expect(maskLabelForShare('abc')).toBe('a•••');
  });

  it('長めは先頭2＋末尾2を残す', () => {
    expect(maskLabelForShare('Alice')).toBe('A•••');
    expect(maskLabelForShare('1234567890')).toBe('12•••90');
  });
});
