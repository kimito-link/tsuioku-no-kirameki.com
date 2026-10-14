import { describe, expect, it } from 'vitest';
import {
  LANE_COUNT_REORDER_MIN_GAP_MS,
  compareByTierThenCount,
  formatLaneCountOrderLine,
  makeLaneCountOrderState,
  orderLaneCandidatesByCount
} from './laneCountOrder.js';

const c = (uid, commentCount, profileTier = 1, thumbScore = 0) => ({ entry: { userId: uid }, commentCount, profileTier, thumbScore, entryIndex: 0 });
const uids = (r) => r.ordered.map((x) => x.entry.userId);
const T0 = 1_000_000;

describe('compareByTierThenCount', () => {
  it('★段が上が先・同段は件数の多い人が先(uid 昇順ではない)', () => {
    const l = [c('a:1', 1), c('a:2', 9), c('3', 5, 3)].sort(compareByTierThenCount);
    expect(l.map((x) => x.entry.userId)).toEqual(['3', 'a:2', 'a:1']);
  });
  it('同数は従来の比較器へ落ちる(落ちない)', () => {
    expect(() => [c('a:1', 2), c('a:2', 2)].sort(compareByTierThenCount)).not.toThrow();
  });
});

describe('orderLaneCandidatesByCount', () => {
  it('★初回は件数降順に並べ、順位表を作る', () => {
    const st = makeLaneCountOrderState();
    const r = orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 1), c('a:y', 5), c('a:z', 3)], nowMs: T0 });
    expect(uids(r)).toEqual(['a:y', 'a:z', 'a:x']);
    expect(r.reordered).toBe(true);
    expect(st.rank.size).toBe(3);
  });
  it('★60秒未満は件数が逆転しても並びを動かさない', () => {
    const st = makeLaneCountOrderState();
    orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 1), c('a:y', 5), c('a:z', 3)], nowMs: T0 });
    const r = orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 99), c('a:y', 5), c('a:z', 3)], nowMs: T0 + LANE_COUNT_REORDER_MIN_GAP_MS - 1 });
    expect(uids(r)).toEqual(['a:y', 'a:z', 'a:x']);
    expect(r.reordered).toBe(false);
  });
  it('★60秒たつと取り直す', () => {
    const st = makeLaneCountOrderState();
    orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 1), c('a:y', 5)], nowMs: T0 });
    const r = orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 99), c('a:y', 5)], nowMs: T0 + LANE_COUNT_REORDER_MIN_GAP_MS });
    expect(uids(r)).toEqual(['a:x', 'a:y']);
    expect(st.reorders).toBe(2);
  });
  it('★間の新しい人は末尾に足すだけ(既存の人は動かない・件数が多くても割り込まない)', () => {
    const st = makeLaneCountOrderState();
    orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 1), c('a:y', 5)], nowMs: T0 });
    const r = orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 1), c('a:y', 5), c('a:n', 500)], nowMs: T0 + 1000 });
    expect(uids(r)).toEqual(['a:y', 'a:x', 'a:n']);
    expect(r.appended).toBe(1);
    expect(uids(orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:n', 500), c('a:x', 1), c('a:y', 5)], nowMs: T0 + 2000 }))).toEqual(['a:y', 'a:x', 'a:n']);
  });
  it('★減らさない: 入力にいる人は必ず出力にいる', () => {
    const st = makeLaneCountOrderState();
    const input = [c('a:x', 1), c('a:y', 5), c('3', 2, 3)];
    expect(orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: input, nowMs: T0 }).ordered).toHaveLength(3);
    expect(orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: input, nowMs: T0 + 5 }).ordered).toHaveLength(3);
  });
  it('★段(tier)は並べ替えの間も優先(上の段の人が先頭側)', () => {
    const st = makeLaneCountOrderState();
    orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 9), c('7', 1, 3)], nowMs: T0 });
    const r = orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 9), c('7', 1, 3), c('8', 1, 3)], nowMs: T0 + 10 });
    expect(uids(r)).toEqual(['7', '8', 'a:x']);
  });
  it('★配信が変わったら取り直す', () => {
    const st = makeLaneCountOrderState();
    orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 1), c('a:y', 5)], nowMs: T0 });
    const r = orderLaneCandidatesByCount(st, { liveId: 'lv2', candidates: [c('a:x', 9), c('a:y', 1)], nowMs: T0 + 10 });
    expect(r.reordered).toBe(true);
    expect(uids(r)).toEqual(['a:x', 'a:y']);
  });
  it('入力が不正でも落ちない', () => {
    const st = makeLaneCountOrderState();
    expect(orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: /** @type {any} */ (null), nowMs: 1 }).ordered).toEqual([]);
  });
});

describe('formatLaneCountOrderLine', () => {
  it('観測前は空・後は取り直し回数が出る', () => {
    const st = makeLaneCountOrderState();
    expect(formatLaneCountOrderLine(st)).toBe('');
    orderLaneCandidatesByCount(st, { liveId: 'lv1', candidates: [c('a:x', 1)], nowMs: T0 });
    expect(formatLaneCountOrderLine(st)).toContain('取り直し1回');
  });
});
