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
});
