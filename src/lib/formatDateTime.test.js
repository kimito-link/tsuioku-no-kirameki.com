import { describe, it, expect } from 'vitest';
import { formatDateTime } from './formatDateTime.js';

describe('formatDateTime', () => {
  it('正常な epoch ms → ja-JP 形式', () => {
    // 2026-04-30 10:00:00 UTC のテストは TZ 依存になるので、形式だけ確認。
    const result = formatDateTime(Date.UTC(2026, 3, 30, 10, 0, 0));
    // 2026/04/30 形式の数値部分を含むこと
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/\d{2}/);
  });

  it('0 → "-"', () => {
    expect(formatDateTime(0)).toBe('-');
  });

  it('負値 → "-"', () => {
    expect(formatDateTime(-100)).toBe('-');
  });

  it('NaN → "-"', () => {
    expect(formatDateTime(NaN)).toBe('-');
  });

  it('null → "-"', () => {
    expect(formatDateTime(null)).toBe('-');
  });

  it('undefined → "-"', () => {
    expect(formatDateTime(undefined)).toBe('-');
  });

  it('文字列の数値 → 整形（数値変換可）', () => {
    const result = formatDateTime(String(Date.UTC(2026, 0, 1, 0, 0, 0)));
    expect(result).toMatch(/2026/);
  });

  it('非数値文字列 → "-"', () => {
    expect(formatDateTime('abc')).toBe('-');
  });

  it('Infinity → "-"', () => {
    expect(formatDateTime(Infinity)).toBe('-');
  });
});
