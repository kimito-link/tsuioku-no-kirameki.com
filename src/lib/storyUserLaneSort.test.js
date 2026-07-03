import { describe, expect, it } from 'vitest';
import {
  compareStoryUserLaneCandidates,
  storyUserLaneUidSortRank
} from './storyUserLaneSort.js';

function c(profileTier, thumbScore, userId, entryIndex = 0) {
  return { profileTier, thumbScore, entry: { userId }, entryIndex };
}

describe('storyUserLaneUidSortRank', () => {
  it('数値ID、匿名ID、その他の順に分類する', () => {
    expect(storyUserLaneUidSortRank('12345')).toBe(0);
    expect(storyUserLaneUidSortRank('a:abc')).toBe(1);
    expect(storyUserLaneUidSortRank('name-only')).toBe(2);
  });
});

describe('compareStoryUserLaneCandidates', () => {
  it('profileTier 降順を最優先する', () => {
    const rows = [c(1, 99, 'a:1'), c(3, 0, 'a:2'), c(2, 0, 'a:3')];
    rows.sort(compareStoryUserLaneCandidates);
    expect(rows.map((x) => x.profileTier)).toEqual([3, 2, 1]);
  });

  it('同じ tier では thumbScore 降順にする', () => {
    const rows = [c(2, 0, '22222'), c(2, 2, '11111'), c(2, 1, '33333')];
    rows.sort(compareStoryUserLaneCandidates);
    expect(rows.map((x) => x.thumbScore)).toEqual([2, 1, 0]);
  });

  it('同じ tier/thumb では数値ID、匿名ID、その他の順にする', () => {
    const rows = [c(2, 0, 'x'), c(2, 0, 'a:1'), c(2, 0, '12345')];
    rows.sort(compareStoryUserLaneCandidates);
    expect(rows.map((x) => x.entry.userId)).toEqual(['12345', 'a:1', 'x']);
  });

  it('同じ uid では entryIndex 降順にする', () => {
    const rows = [c(2, 0, '12345', 1), c(2, 0, '12345', 3), c(2, 0, '12345', 2)];
    rows.sort(compareStoryUserLaneCandidates);
    expect(rows.map((x) => x.entryIndex)).toEqual([3, 2, 1]);
  });
});
