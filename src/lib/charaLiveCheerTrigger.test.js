import { describe, expect, it } from 'vitest';
import { CHEER_JUMP_GUARD, CHEER_MIN_MILESTONE, cheerLabel, resolveCommentCheer, shouldSkipShowerForCheer } from './charaLiveCheerTrigger.js';

/** 2026-10-17: 応援コメント100件でゆっくり3人がお祝い。節目の判定は既存の COMMENT_MILESTONES を再利用し、件数は数え直さない。 */
describe('resolveCommentCheer', () => {
  it('★100件を跨いだら祝う(節目=100)・基準は今回の件数に進む', () => {
    expect(resolveCommentCheer(98, 101)).toEqual({ baseline: 101, cheer: { milestone: 100 } });
    expect(resolveCommentCheer(99, 100)).toEqual({ baseline: 100, cheer: { milestone: 100 } });
  });
  it('★一回性: 基準が進むので、同じ節目を二度祝わない(100 を超えたあとの 101→102 は祝わない)', () => {
    const a = resolveCommentCheer(99, 100);
    const b = resolveCommentCheer(a.baseline, 101);
    expect(b.cheer).toBeNull();
    expect(resolveCommentCheer(100, 100).cheer).toBeNull();
  });
  it('★開いて最初の観測(prev null)は基準を採るだけで祝わない(昔の節目を開いた瞬間に祝わない)', () => {
    expect(resolveCommentCheer(null, 250)).toEqual({ baseline: 250, cheer: null });
    expect(resolveCommentCheer(undefined, 0)).toEqual({ baseline: 0, cheer: null });
  });
  it('★10/25/50 は祝わない(ユーザー要望は100件から・既存の演出のみ)', () => {
    expect(resolveCommentCheer(9, 11).cheer).toBeNull();
    expect(resolveCommentCheer(24, 26).cheer).toBeNull();
    expect(resolveCommentCheer(49, 51).cheer).toBeNull();
    expect(CHEER_MIN_MILESTONE).toBe(100);
  });
  it('★200/500 も祝う(一度に複数跨いだら最大の節目)', () => {
    expect(resolveCommentCheer(199, 201).cheer).toEqual({ milestone: 200 });
    expect(resolveCommentCheer(499, 500).cheer).toEqual({ milestone: 500 });
    expect(resolveCommentCheer(90, 210).cheer).toEqual({ milestone: 200 });
  });
  it('★500 のあとは 1000 件ごと(1000,2000,3000,4000…)・その間は祝わない(長い配信でうるさくしない)', () => {
    expect(resolveCommentCheer(999, 1000).cheer).toEqual({ milestone: 1000 });
    expect(resolveCommentCheer(1500, 1999).cheer).toBeNull();
    expect(resolveCommentCheer(1999, 2000).cheer).toEqual({ milestone: 2000 });
    expect(resolveCommentCheer(3999, 4000).cheer).toEqual({ milestone: 4000 });
    expect(resolveCommentCheer(5900, 6100).cheer).toEqual({ milestone: 6000 });
    expect(resolveCommentCheer(600, 900).cheer).toBeNull();
  });
  it('★一括流入(jumpGuard 以上の増加=backfill/タイムシフト)は基準を更新するだけで祝わない', () => {
    expect(resolveCommentCheer(50, 50 + CHEER_JUMP_GUARD)).toEqual({ baseline: 350, cheer: null });
    expect(resolveCommentCheer(50, 50 + CHEER_JUMP_GUARD - 1).cheer).toEqual({ milestone: 200 });
  });
  it('件数が減った(配信切替など)・不正な値は祝わない(基準を壊さない)', () => {
    expect(resolveCommentCheer(500, 3)).toEqual({ baseline: 3, cheer: null });
    expect(resolveCommentCheer(98, 'abc')).toEqual({ baseline: 98, cheer: null });
    expect(resolveCommentCheer(98, -4)).toEqual({ baseline: 98, cheer: null });
    expect(resolveCommentCheer(null, null)).toEqual({ baseline: null, cheer: null });
  });
});

describe('cheerLabel', () => {
  it('「100件!」「1,000件!」', () => {
    expect(cheerLabel(100)).toBe('100件!');
    expect(cheerLabel(1000)).toBe('1,000件!');
    expect(cheerLabel('x')).toBe('');
  });
});

describe('shouldSkipShowerForCheer(会場を開いている間は3人だけ)', () => {
  const p = (key, variant = 'support', kind = 'comment_milestone') => ({ variant, spec: { kind, dedupeKey: key } });
  it('★会場が開いていて、100件以上の comment_milestone のシャワーは止める', () => {
    expect(shouldSkipShowerForCheer(p('comment_100'), true)).toBe(true);
    expect(shouldSkipShowerForCheer(p('comment_1000'), true)).toBe(true);
  });
  it('★会場が閉じていれば従来どおり出す', () => {
    expect(shouldSkipShowerForCheer(p('comment_100'), false)).toBe(false);
    expect(shouldSkipShowerForCheer(p('comment_100'), /** @type {any} */ (undefined))).toBe(false);
  });
  it('★10/25/50(3人は祝わない節目)・他の種類の祝い・他の variant は止めない', () => {
    expect(shouldSkipShowerForCheer(p('comment_50'), true)).toBe(false);
    expect(shouldSkipShowerForCheer(p('gift_100', 'support', 'gift_milestone'), true)).toBe(false);
    expect(shouldSkipShowerForCheer(p('comment_100', 'self_action'), true)).toBe(false);
    expect(shouldSkipShowerForCheer(null, true)).toBe(false);
    expect(shouldSkipShowerForCheer({ variant: 'support' }, true)).toBe(false);
  });
});
