import { describe, expect, it } from 'vitest';
import { tierForCommentDelta } from './commentDeltaTier.js';
import { tierForCommentDelta as fromLiveMotion } from './liveMotion.js';

describe('commentDeltaTier(葉モジュール・v0.1.1566)', () => {
  it('liveMotion.js は同じ関数を re-export している(正本は1つ・/live/ は無変更)', () => {
    expect(fromLiveMotion).toBe(tierForCommentDelta);
  });
  it('境界 2 / 5 / 10 で段階が上がる', () => {
    expect(tierForCommentDelta(1)).toBe('small');
    expect(tierForCommentDelta(2)).toBe('medium');
    expect(tierForCommentDelta(4)).toBe('medium');
    expect(tierForCommentDelta(5)).toBe('large');
    expect(tierForCommentDelta(9)).toBe('large');
    expect(tierForCommentDelta(10)).toBe('mega');
  });
});
