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

  // 実データで動くこと=網羅と取りこぼしの実態を固定。
  it('実 changelog(同梱分)で系統が複数できる・全版がどこかに入る', () => {
    const lineage = buildChangelogLineage(EXTENSION_CHANGELOG);
    expect(lineage.length).toBeGreaterThan(3);
    /*
     * ★2026-08-19: 以前は「💾 記録件数 の系統が複数版ある」を断言していたが、
     *   changelog.js を **直近20版**へ戻した(旧版は changelog-archive.js)ため、
     *   どの系統が何版含まれるかは**同梱する版によって変わる**＝
     *   特定タグの存在を固定すると、版が進むたびに無関係に赤くなる。
     *   ★守りたかったのは「取りこぼしゼロ」なので、そちらだけを断言する。
     *   (バンドル削減の経緯: popup が 2,404KB→1,392KB。changelog 単独で1,042KB=43%だった)
     */
    // 全版が「その系統 or その他」のどこかに必ず1回以上現れる(取りこぼしゼロ)。
    const seen = new Set();
    for (const b of lineage) for (const v of b.versions) seen.add(v.version);
    expect(seen.size).toBe(EXTENSION_CHANGELOG.length);
    /*
     * ★1版が複数の系統に入るのは【正常】(1つの修正が複数の症状に触れることがある)。
     *   実測: 20版 → 延べ28件。合計＝版数を期待するのは誤り(私が一度書いて赤にした)。
     */
    const total = lineage.reduce((a, b) => a + b.versions.length, 0);
    expect(total).toBeGreaterThanOrEqual(EXTENSION_CHANGELOG.length);
  });
});
