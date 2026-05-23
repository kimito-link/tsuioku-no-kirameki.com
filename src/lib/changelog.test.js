/**
 * EXTENSION_CHANGELOG のテスト。
 *
 * 0.1.12 (D): popup の「更新履歴」表示用データ。version 単調・日付形式・
 *   構造の不変条件をユニットテストで保護し、バージョンバンプの度に
 *   壊れない（誤って古いほうを先頭にしてしまう、版番号を空欄にする等）
 *   ことを保証する。
 */

import { describe, it, expect } from 'vitest';
import {
  EXTENSION_CHANGELOG,
  getLatestChangelogEntry,
  compareSemver
} from './changelog.js';

describe('EXTENSION_CHANGELOG', () => {
  it('frozen array を返す', () => {
    expect(Array.isArray(EXTENSION_CHANGELOG)).toBe(true);
    expect(Object.isFrozen(EXTENSION_CHANGELOG)).toBe(true);
    for (const entry of EXTENSION_CHANGELOG) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.items)).toBe(true);
    }
  });

  it('各エントリは {version, date, summary, items} を持つ', () => {
    for (const entry of EXTENSION_CHANGELOG) {
      expect(typeof entry.version).toBe('string');
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(typeof entry.date).toBe('string');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.summary).toBe('string');
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.items)).toBe(true);
      expect(entry.items.length).toBeGreaterThan(0);
      for (const it of entry.items) {
        expect(typeof it).toBe('string');
        expect(it.length).toBeGreaterThan(0);
      }
    }
  });

  it('最新（先頭）が最大バージョン（semver 比較で単調降順）', () => {
    for (let i = 0; i < EXTENSION_CHANGELOG.length - 1; i++) {
      const cur = EXTENSION_CHANGELOG[i].version;
      const next = EXTENSION_CHANGELOG[i + 1].version;
      expect(compareSemver(cur, next)).toBeGreaterThan(0);
    }
  });

  it('version が重複しない', () => {
    const versions = EXTENSION_CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('現在の manifest.json バージョン（0.1.332）が先頭にある', () => {
    expect(EXTENSION_CHANGELOG[0].version).toBe('0.1.332');
  });

  it('summary は短い（35 字以内、popup の summary 行で省略しないため）', () => {
    for (const entry of EXTENSION_CHANGELOG) {
      expect(entry.summary.length).toBeLessThanOrEqual(35);
    }
  });

  it('項目は技術用語ではなく利用者が読める表現（HTML タグなし）', () => {
    for (const entry of EXTENSION_CHANGELOG) {
      for (const it of entry.items) {
        // テキストノードでそのまま出すので HTML は入れない
        expect(it).not.toMatch(/<\/?[a-z]/i);
      }
    }
  });
});

describe('getLatestChangelogEntry', () => {
  it('CHANGELOG の先頭を返す', () => {
    const e = getLatestChangelogEntry();
    expect(e).toBe(EXTENSION_CHANGELOG[0]);
  });
});

describe('compareSemver', () => {
  it('0.1.12 > 0.1.11', () => {
    expect(compareSemver('0.1.12', '0.1.11')).toBeGreaterThan(0);
  });

  it('0.1.11 < 0.1.12', () => {
    expect(compareSemver('0.1.11', '0.1.12')).toBeLessThan(0);
  });

  it('0.2.0 > 0.1.99', () => {
    expect(compareSemver('0.2.0', '0.1.99')).toBeGreaterThan(0);
  });

  it('1.0.0 > 0.99.99', () => {
    expect(compareSemver('1.0.0', '0.99.99')).toBeGreaterThan(0);
  });

  it('同値は 0', () => {
    expect(compareSemver('0.1.12', '0.1.12')).toBe(0);
  });

  it('数値として比較（文字列比較ではなく）', () => {
    expect(compareSemver('0.1.10', '0.1.9')).toBeGreaterThan(0); // 文字列だと '10' < '9'
  });
});
