import { describe, it, expect } from 'vitest';
import {
  checkChangelogConsistency,
  CHANGELOG_SUMMARY_MAX
} from './changelogConsistency.js';

const okHead = {
  version: '0.1.835',
  date: '2026-06-20',
  summary: '版番号の三者一致ゲートを追加',
  items: ['説明文。']
};

const okInput = {
  changelogVersion: '0.1.835',
  manifestVersion: '0.1.835',
  packageVersion: '0.1.835',
  headEntry: okHead
};

describe('checkChangelogConsistency', () => {
  it('三者一致+体裁OK → 違反ゼロ', () => {
    expect(checkChangelogConsistency(okInput)).toEqual([]);
  });

  it('package だけ古い(bump 忘れ) → 三者不一致を検出', () => {
    const v = checkChangelogConsistency({ ...okInput, packageVersion: '0.1.834' });
    expect(v.some((m) => m.includes('三者不一致'))).toBe(true);
  });

  it('manifest だけ古い → 三者不一致を検出', () => {
    const v = checkChangelogConsistency({ ...okInput, manifestVersion: '0.1.834' });
    expect(v.some((m) => m.includes('三者不一致'))).toBe(true);
  });

  it('changelog version が semver でない → 不正を検出', () => {
    const v = checkChangelogConsistency({
      ...okInput,
      changelogVersion: 'v0.1.835',
      headEntry: { ...okHead, version: 'v0.1.835' }
    });
    expect(v.some((m) => m.includes('不正な semver'))).toBe(true);
  });

  it('date が YYYY-MM-DD でない → 検出', () => {
    const v = checkChangelogConsistency({
      ...okInput,
      headEntry: { ...okHead, date: '2026/6/20' }
    });
    expect(v.some((m) => m.includes('date'))).toBe(true);
  });

  it('summary が 35 字超 → 検出', () => {
    const long = 'あ'.repeat(CHANGELOG_SUMMARY_MAX + 1);
    const v = checkChangelogConsistency({
      ...okInput,
      headEntry: { ...okHead, summary: long }
    });
    expect(v.some((m) => m.includes('summary が長い'))).toBe(true);
  });

  it('summary が 35 字ちょうど → OK(境界)', () => {
    const exact = 'あ'.repeat(CHANGELOG_SUMMARY_MAX);
    const v = checkChangelogConsistency({
      ...okInput,
      headEntry: { ...okHead, summary: exact }
    });
    expect(v).toEqual([]);
  });

  it('items 空 → 検出', () => {
    const v = checkChangelogConsistency({
      ...okInput,
      headEntry: { ...okHead, items: [] }
    });
    expect(v.some((m) => m.includes('items'))).toBe(true);
  });

  it('headEntry 欠落 → 検出', () => {
    const v = checkChangelogConsistency({ ...okInput, headEntry: null });
    expect(v.some((m) => m.includes('先頭エントリが無い'))).toBe(true);
  });

  it('入力が null → 安全に違反扱い', () => {
    expect(checkChangelogConsistency(null).length).toBeGreaterThan(0);
  });
});
