import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createStoryDiagCountsPaceState, shouldReuseStoryDiagCounts, STORY_DIAG_PACE_MS } from './storyDiagCountsPace.js';

describe('shouldReuseStoryDiagCounts', () => {
  it('小さな記録(5,000行未満)は毎回数える', () => {
    const st = createStoryDiagCountsPaceState();
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 4999, nowMs: 1000 })).toBe(false);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 4999, nowMs: 2000 })).toBe(false);
    expect(st.counted).toBe(2);
  });
  it('大きな記録で同じ配信・同じ行数なら、60秒は前の値を使う', () => {
    const st = createStoryDiagCountsPaceState();
    expect(shouldReuseStoryDiagCounts(st, { lv: 'LV1', len: 81110, nowMs: 1000 })).toBe(false);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110, nowMs: 4000 })).toBe(true);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110, nowMs: 1000 + STORY_DIAG_PACE_MS - 1 })).toBe(true);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110, nowMs: 1000 + STORY_DIAG_PACE_MS })).toBe(false);
    expect(st.reused).toBe(2);
  });
  it('配信が替わったらすぐ数え直す', () => {
    const st = createStoryDiagCountsPaceState();
    shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110, nowMs: 1000 });
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv2', len: 81111, nowMs: 3000 })).toBe(false);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv2', len: 81111, nowMs: 4000 })).toBe(true);
  });
  it('生放送の途中: 少し増えただけ(数えたときから 2% まで)なら前の値を使う(v0.1.1985)', () => {
    const st = createStoryDiagCountsPaceState();
    shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110, nowMs: 1000 });
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81111, nowMs: 2000 })).toBe(true);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110 + 1622, nowMs: 3000 })).toBe(true);
    // 2% を超えて増えたら数え直す(基準はそのときの行数に替わる)
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110 + 1623, nowMs: 4000 })).toBe(false);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110 + 1700, nowMs: 5000 })).toBe(true);
  });
  it('行数が減ったらすぐ数え直す', () => {
    const st = createStoryDiagCountsPaceState();
    shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110, nowMs: 1000 });
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81109, nowMs: 2000 })).toBe(false);
  });
  it('増えていても1分たてば数え直す', () => {
    const st = createStoryDiagCountsPaceState();
    shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81110, nowMs: 1000 });
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: 81200, nowMs: 1000 + STORY_DIAG_PACE_MS })).toBe(false);
  });
  it('配信が空・数でない入力は数え直す側に倒す', () => {
    const st = createStoryDiagCountsPaceState();
    expect(shouldReuseStoryDiagCounts(st, { lv: '', len: 81110, nowMs: 1 })).toBe(false);
    expect(shouldReuseStoryDiagCounts(st, { lv: '', len: 81110, nowMs: 2 })).toBe(false);
    expect(shouldReuseStoryDiagCounts(st, { lv: 'lv1', len: NaN, nowMs: 3 })).toBe(false);
  });
});

describe('popup の配線', () => {
  const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
  it('使い回すのは診断用の数え上げだけ(件数の正本 total は毎回決める)', () => {
    const at = src.indexOf('if (!shouldReuseStoryDiagCounts(_storyDiagCountsPace, { lv, len: arr.length, nowMs: Date.now() })) {');
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 900);
    for (const f of ['countEntriesWithUserId(arr)', 'countEntriesWithAvatar(arr)', 'countUniqueAvatarEntries(arr)', 'countResolvedAvatarEntries(arr, lv)', 'countOwnPostedEntries(arr, lv)', 'countSavedOwnPostedEntries(arr)']) expect(body).toContain(f);
    expect(src.indexOf('STORY_AVATAR_DIAG_STATE.total = _totalResolved.total;')).toBeLessThan(at);
  });
  it('描画の中の数え上げも同じ規則・0 に戻したら必ず数え直す', () => {
    expect(src).toContain('if (!diagPaintDeferActive && !shouldReuseStoryDiagCounts(_storyDiagCountsPacePaint, { lv, len: arr.length, nowMs: Date.now() })) {');
    expect(src).toContain("_storyDiagCountsPace.lv = ''; _storyDiagCountsPacePaint.lv = '';");
  });
});
