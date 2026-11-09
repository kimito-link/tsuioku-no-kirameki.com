import { describe, it, expect } from 'vitest';
import {
  STORY_GROWTH_REBUILD_REASON as R,
  createStoryGrowthRebuildReasonState,
  findStoryEntryDiff,
  noteStoryEntryDiff,
  formatStoryGrowthRebuildReasons,
  noteStoryGrowthRebuildReason,
  noteStoryGrowthTarget
} from './storyGrowthRebuildReasons.js';

describe('storyGrowthRebuildReasons', () => {
  it('記録が無ければ空文字', () => {
    expect(formatStoryGrowthRebuildReasons(createStoryGrowthRebuildReasonState(), 0)).toBe('');
    expect(formatStoryGrowthRebuildReasons(null, 0)).toBe('');
  });

  it('入口別に数え、多い順に出す', () => {
    const s = createStoryGrowthRebuildReasonState();
    noteStoryGrowthRebuildReason(s, { reason: R.SHRINK, from: 98, to: 40, dom: 98, atMs: 1000 });
    noteStoryGrowthRebuildReason(s, { reason: R.SHRINK, from: 98, to: 40, dom: 98, atMs: 2000 });
    noteStoryGrowthRebuildReason(s, { reason: R.LIVE, from: 98, to: 0, dom: 98, liveSame: false, atMs: 3000 });
    const line = formatStoryGrowthRebuildReasons(s, 3000);
    expect(line).toContain('応援マスの作り直し3回(件数の縮小2・配信切替1)');
    expect(line).toContain('件数の縮小 98→40(画面98) 2秒前');
    expect(line).toContain('配信切替 98→0(画面98・配信が変化) 0秒前');
  });

  it('目標件数の揺れを畳んで出し、配信の行き来を数える(id は残さない)', () => {
    const s = createStoryGrowthRebuildReasonState();
    for (const t of [98, 98, 40, 98, 40]) noteStoryGrowthTarget(s, { liveKey: 'lv1', target: t });
    noteStoryGrowthTarget(s, { liveKey: '', target: 0 });
    noteStoryGrowthTarget(s, { liveKey: 'lv1', target: 98 });
    const line = formatStoryGrowthRebuildReasons(s, 0);
    expect(line).toContain('目標件数の推移 98→40→98→40→0→98');
    expect(line).toContain('配信の行き来2回');
    expect(line).not.toContain('lv1');
  });

  it('直近は最大8件・目標は最大12件まで', () => {
    const s = createStoryGrowthRebuildReasonState();
    for (let i = 0; i < 20; i += 1) {
      noteStoryGrowthRebuildReason(s, { reason: R.DOM_MISMATCH, from: i, to: i, dom: 0 });
      noteStoryGrowthTarget(s, { liveKey: 'a', target: i });
    }
    expect(s.recent.length).toBe(8);
    expect(s.targets.length).toBe(12);
    expect(s.counts[R.DOM_MISMATCH]).toBe(20);
  });
});

describe('findStoryEntryDiff / noteStoryEntryDiff (v0.1.1889)', () => {
  it('末尾に1件多い側と位置を返す', () => {
    expect(findStoryEntryDiff(['a', 'b', 'c'], ['a', 'b'])).toEqual({ index: 2, extraIn: 'prev', atEnd: true });
    expect(findStoryEntryDiff(['a', 'b'], ['a', 'b', 'c'])).toEqual({ index: 2, extraIn: 'next', atEnd: true });
  });
  it('途中に挟まった1件も見つける', () => {
    expect(findStoryEntryDiff(['a', 'c'], ['a', 'x', 'c'])).toEqual({ index: 1, extraIn: 'next', atEnd: false });
  });
  it('同じ件数・大きく違うときは null', () => {
    expect(findStoryEntryDiff(['a'], ['b'])).toBeNull();
    expect(findStoryEntryDiff([], ['a', 'b', 'c'])).toBeNull();
  });
  it('余分な1件の特徴を数えて1行に出す。末尾だけ削るは作り直しに数えない', () => {
    const s = createStoryGrowthRebuildReasonState();
    noteStoryEntryDiff(s, '末尾・自分の投稿');
    noteStoryEntryDiff(s, '末尾・自分の投稿');
    noteStoryGrowthRebuildReason(s, { reason: R.TRIM, from: 58, to: 57, dom: 58 });
    const line = formatStoryGrowthRebuildReasons(s, 0);
    expect(line).toContain('応援マスの作り直し0回(末尾だけ削る1)');
    expect(line).toContain('件数が揺れたときの余分な1件: 末尾・自分の投稿×2');
  });
});
