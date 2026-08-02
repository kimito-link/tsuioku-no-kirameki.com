import { describe, expect, it } from 'vitest';
import {
  bucketStoryUserLanePicks,
  flattenStoryUserLaneBuckets
} from './storyUserLaneBuckets.js';

function t(tier, id) {
  return { profileTier: tier, id };
}

describe('bucketStoryUserLanePicks', () => {
  it('空配列はすべて空', () => {
    const b = bucketStoryUserLanePicks([], 24);
    expect(b.link).toEqual([]);
    expect(b.konta).toEqual([]);
    expect(b.tanu).toEqual([]);
  });

  it('maxTotal 0 はすべて空', () => {
    const sorted = [t(3, 'a'), t(2, 'b'), t(1, 'c')];
    const b = bucketStoryUserLanePicks(sorted, 0);
    expect(b.link).toEqual([]);
    expect(b.konta).toEqual([]);
    expect(b.tanu).toEqual([]);
  });

  it('単一ソート先頭 N 件と同じ集合になる（混在）', () => {
    const sorted = [
      t(3, 'r1'),
      t(3, 'r2'),
      t(2, 'k1'),
      t(2, 'k2'),
      t(1, 'u1'),
      t(1, 'u2')
    ];
    const flat = sorted.slice(0, 4).map((x) => x.id);
    const b = bucketStoryUserLanePicks(sorted, 4);
    expect(flattenStoryUserLaneBuckets(b).map((x) => x.id)).toEqual(flat);
    expect(b.link.map((x) => x.id)).toEqual(['r1', 'r2']);
    expect(b.konta.map((x) => x.id)).toEqual(['k1', 'k2']);
    expect(b.tanu).toEqual([]);
  });

  it('tier3 だけ大量でも max で打ち切る', () => {
    const sorted = Array.from({ length: 40 }, (_, i) => t(3, `r${i}`));
    const b = bucketStoryUserLanePicks(sorted, 24);
    expect(b.link).toHaveLength(24);
    expect(b.konta).toEqual([]);
    expect(b.tanu).toEqual([]);
  });

  it('tier1 のみなら tanu にだけ入る', () => {
    const sorted = [t(1, 'a'), t(1, 'b')];
    const b = bucketStoryUserLanePicks(sorted, 10);
    expect(b.link).toEqual([]);
    expect(b.konta).toEqual([]);
    expect(b.tanu.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('tier 内の相対順序を保つ', () => {
    const sorted = [t(3, 'first'), t(3, 'second'), t(3, 'third')];
    const b = bucketStoryUserLanePicks(sorted, 2);
    expect(b.link.map((x) => x.id)).toEqual(['first', 'second']);
  });

  // v0.1.1232 lane-never-drop: 表示上限の撤廃は maxTotal=Infinity で表現する。
  //   Math.max(0, Math.floor(Number(Infinity)||0)) === Infinity / slice(0, Infinity) は全件。
  //   ★これは実装の偶然ではなく「契約」なので、ここで固定する(退行検知)。
  it('maxTotal=Infinity で全候補を返す(切り捨てゼロ・段の順序は不変)', () => {
    const sorted = [
      ...Array.from({ length: 300 }, (_, i) => t(3, `link${i}`)),
      ...Array.from({ length: 200 }, (_, i) => t(2, `konta${i}`)),
      ...Array.from({ length: 100 }, (_, i) => t(1, `tanu${i}`))
    ];
    const b = bucketStoryUserLanePicks(sorted, Number.POSITIVE_INFINITY);
    expect(b.link).toHaveLength(300);
    expect(b.konta).toHaveLength(200);
    expect(b.tanu).toHaveLength(100);
    expect(flattenStoryUserLaneBuckets(b)).toHaveLength(600);
    // 段の順序(link→konta→tanu)と段内順序は不変。
    expect(b.link[0].id).toBe('link0');
    expect(b.tanu[99].id).toBe('tanu99');
  });

  it('有限maxTotalの既存挙動は不変(回帰)', () => {
    const sorted = [t(3, 'a'), t(3, 'b'), t(2, 'c'), t(1, 'd')];
    const b = bucketStoryUserLanePicks(sorted, 3);
    expect(b.link.map((x) => x.id)).toEqual(['a', 'b']);
    expect(b.konta.map((x) => x.id)).toEqual(['c']);
    expect(b.tanu).toEqual([]);
  });
});
