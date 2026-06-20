import { describe, it, expect } from 'vitest';
import {
  buildChangelogLineage,
  tagsForChangelogEntry
} from './changelogLineage.js';
import { EXTENSION_CHANGELOG } from './changelog.js';

describe('tagsForChangelogEntry', () => {
  it('記録件数系の版を記録系統に分類', () => {
    const tags = tagsForChangelogEntry({
      version: '0.1.838',
      date: '2026-06-20',
      summary: '記録数が0に潰れる不具合を根治',
      items: ['配信者本人のコメントを差し引く処理が…']
    });
    expect(tags).toContain('💾 記録件数');
  });

  it('匿名系の版を匿名系統に分類', () => {
    const tags = tagsForChangelogEntry({
      version: '0.1.836',
      date: '2026-06-20',
      summary: '匿名(184)コメントの記録を救済(第1歩)',
      items: ['匿名コメントが…']
    });
    expect(tags).toContain('🙂 匿名(184)');
  });

  it('1版が複数系統に該当しうる(multi-tag)', () => {
    const tags = tagsForChangelogEntry({
      version: '0.1.x',
      date: '2026-06-20',
      summary: '匿名コメントを会場の席に出す',
      items: ['匿名…会場…']
    });
    expect(tags).toContain('🙂 匿名(184)');
    expect(tags).toContain('🏟 会場・席');
  });

  it('どの系統にも当たらねば空配列', () => {
    expect(
      tagsForChangelogEntry({ version: '0.1.x', date: 'd', summary: 'xyz', items: ['abc'] })
    ).toEqual([]);
  });

  it('null/非オブジェクトは空', () => {
    expect(tagsForChangelogEntry(null)).toEqual([]);
    expect(tagsForChangelogEntry(undefined)).toEqual([]);
  });
});

describe('buildChangelogLineage', () => {
  it('系統ごとに版を束ねる(空系統は返さない)', () => {
    const lineage = buildChangelogLineage([
      { version: '0.1.838', date: 'd', summary: '記録数が0に潰れる', items: [] },
      { version: '0.1.836', date: 'd', summary: '匿名(184)を救済', items: [] }
    ]);
    const tags = lineage.map((b) => b.tag);
    expect(tags).toContain('💾 記録件数');
    expect(tags).toContain('🙂 匿名(184)');
    // 該当しない系統(例: 読み上げ)は返らない。
    expect(tags).not.toContain('🔊 読み上げ');
  });

  it('どの系統にも当たらない版は その他 に入る', () => {
    const lineage = buildChangelogLineage([
      { version: '0.1.x', date: 'd', summary: 'なんとなくの改善', items: ['詳細不明'] }
    ]);
    const other = lineage.find((b) => b.tag === 'その他');
    expect(other).toBeTruthy();
    expect(other.versions).toHaveLength(1);
  });

  it('非配列は空', () => {
    expect(buildChangelogLineage(null)).toEqual([]);
  });

  // 実データ(177版)で動くこと=網羅と取りこぼしの実態を固定。
  it('実 changelog(全版)で系統が複数できる・全版がどこかに入る', () => {
    const lineage = buildChangelogLineage(EXTENSION_CHANGELOG);
    expect(lineage.length).toBeGreaterThan(3);
    // 記録件数系は実績で複数版ある(v0.1.792/804/838/839…)。
    const rec = lineage.find((b) => b.tag === '💾 記録件数');
    expect(rec).toBeTruthy();
    expect(rec.versions.length).toBeGreaterThan(1);
    // 全版が「その系統 or その他」のどこかに必ず1回以上現れる(取りこぼしゼロ)。
    const seen = new Set();
    for (const b of lineage) for (const v of b.versions) seen.add(v.version);
    expect(seen.size).toBe(EXTENSION_CHANGELOG.length);
  });
});
