import { describe, expect, it } from 'vitest';
import {
  computeVoiceQueueSpeedBoost,
  pushVoiceQueue
} from './voiceReadQueue.js';

describe('pushVoiceQueue', () => {
  it('空キューへ1件追加する', () => {
    expect(pushVoiceQueue([], 'a')).toEqual({ queue: ['a'], dropped: [] });
  });

  it('既存順を保って末尾へ追加する', () => {
    expect(pushVoiceQueue(['a', 'b'], 'c')).toEqual({
      queue: ['a', 'b', 'c'],
      dropped: []
    });
  });

  it('既定上限5件を超えたら最古を落とす', () => {
    expect(pushVoiceQueue(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual({
      queue: ['b', 'c', 'd', 'e', 'f'],
      dropped: ['a']
    });
  });

  it('複数件超過時も古い順で dropped に返す', () => {
    expect(pushVoiceQueue(['a', 'b', 'c', 'd'], 'e', { max: 2 })).toEqual({
      queue: ['d', 'e'],
      dropped: ['a', 'b', 'c']
    });
  });

  it('入力キューを変更しない', () => {
    const source = ['a', 'b'];
    pushVoiceQueue(source, 'c');
    expect(source).toEqual(['a', 'b']);
  });

  it('max=0 は追加項目を含め全件 dropped にする', () => {
    expect(pushVoiceQueue(['a'], 'b', { max: 0 })).toEqual({
      queue: [],
      dropped: ['a', 'b']
    });
  });

  it('配列でない入力は空キューとして扱う', () => {
    expect(pushVoiceQueue(null, 'a')).toEqual({ queue: ['a'], dropped: [] });
  });
});

describe('computeVoiceQueueSpeedBoost', () => {
  it('0件は加速しない', () => {
    expect(computeVoiceQueueSpeedBoost(0)).toBe(0);
  });

  it('2件までは加速しない', () => {
    expect(computeVoiceQueueSpeedBoost(2)).toBe(0);
  });

  it('3件以上は+0.1', () => {
    expect(computeVoiceQueueSpeedBoost(3)).toBe(0.1);
    expect(computeVoiceQueueSpeedBoost(4)).toBe(0.1);
  });

  it('5件以上は+0.2', () => {
    expect(computeVoiceQueueSpeedBoost(5)).toBe(0.2);
    expect(computeVoiceQueueSpeedBoost(20)).toBe(0.2);
  });

  it('負数や不正値は0件として扱う', () => {
    expect(computeVoiceQueueSpeedBoost(-10)).toBe(0);
    expect(computeVoiceQueueSpeedBoost('invalid')).toBe(0);
  });
});
