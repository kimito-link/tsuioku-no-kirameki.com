import { describe, test, expect } from 'vitest';
import {
  updateSpeechStreak,
  pruneSpeechStreaks,
  streakGlowStage,
  streakBubbleLifetimeMs,
  resolveBubbleFlowLifetimeMs,
  STREAK_GAP_MS,
  STREAK_MAX
} from './venueSpeechStreak.js';

describe('resolveBubbleFlowLifetimeMs (v0.1.755 流速可変寿命=速いほど短命で詰まらせない)', () => {
  test('低流速(~1件/秒以下)は base のまま長く残る', () => {
    expect(resolveBubbleFlowLifetimeMs(0, 4000)).toBe(4000);
    expect(resolveBubbleFlowLifetimeMs(1, 4000)).toBe(4000);
  });
  test('高流速ほど寿命が短くなる(単調減少)', () => {
    const slow = resolveBubbleFlowLifetimeMs(2, 4000);
    const mid = resolveBubbleFlowLifetimeMs(6, 4000);
    const fast = resolveBubbleFlowLifetimeMs(20, 4000);
    expect(slow).toBeLessThan(4000);
    expect(mid).toBeLessThan(slow);
    expect(fast).toBeLessThanOrEqual(mid);
  });
  test('下限(1.2秒)で頭打ち=速すぎても読めなくならない', () => {
    expect(resolveBubbleFlowLifetimeMs(1000, 4000)).toBeGreaterThanOrEqual(1200);
  });
  test('不正値は base', () => {
    expect(resolveBubbleFlowLifetimeMs(NaN, 4000)).toBe(4000);
    expect(resolveBubbleFlowLifetimeMs(-5, 4000)).toBe(4000);
    expect(resolveBubbleFlowLifetimeMs(5, 0)).toBeGreaterThan(0); // base 不正でも既定で動く
  });
});

describe('updateSpeechStreak (連続発言の判定)', () => {
  test('初回はcount=1・連続でない', () => {
    const state = new Map();
    expect(updateSpeechStreak(state, 'u:1', 1000)).toEqual({ count: 1, isContinuation: false });
  });

  test('間隔内の再発言はcountが増え連続扱い', () => {
    const state = new Map();
    updateSpeechStreak(state, 'u:1', 1000);
    const r = updateSpeechStreak(state, 'u:1', 1000 + STREAK_GAP_MS - 1);
    expect(r.count).toBe(2);
    expect(r.isContinuation).toBe(true);
  });

  test('間隔を超えるとリセットされ単発に戻る', () => {
    const state = new Map();
    updateSpeechStreak(state, 'u:1', 1000);
    updateSpeechStreak(state, 'u:1', 1000 + 100);
    const r = updateSpeechStreak(state, 'u:1', 1000 + 100 + STREAK_GAP_MS + 1);
    expect(r.count).toBe(1);
    expect(r.isContinuation).toBe(false);
  });

  test('countはSTREAK_MAXで頭打ち', () => {
    const state = new Map();
    let t = 0;
    let last;
    for (let i = 0; i < STREAK_MAX + 5; i++) {
      last = updateSpeechStreak(state, 'u:1', t);
      t += 100;
    }
    expect(last.count).toBe(STREAK_MAX);
  });

  test('別の人のストリークは独立', () => {
    const state = new Map();
    updateSpeechStreak(state, 'u:1', 1000);
    updateSpeechStreak(state, 'u:1', 1100);
    const other = updateSpeechStreak(state, 'u:2', 1200);
    expect(other.count).toBe(1);
    expect(other.isContinuation).toBe(false);
    expect(state.get('u:1').count).toBe(2);
  });

  test('空のキーや不正stateで例外を投げず単発を返す', () => {
    expect(updateSpeechStreak(new Map(), '', 0)).toEqual({ count: 1, isContinuation: false });
    // @ts-expect-error 不正state
    expect(updateSpeechStreak(null, 'u:1', 0)).toEqual({ count: 1, isContinuation: false });
  });
});

describe('pruneSpeechStreaks (古いストリークの掃除)', () => {
  test('TTLを超えた人だけ削除する', () => {
    const state = new Map();
    updateSpeechStreak(state, 'u:old', 0);
    updateSpeechStreak(state, 'u:new', 100000);
    const removed = pruneSpeechStreaks(state, 100000); // 既定ttl=STREAK_GAP_MS*3
    expect(removed).toBe(1);
    expect(state.has('u:old')).toBe(false);
    expect(state.has('u:new')).toBe(true);
  });
});

describe('streakGlowStage (グロー段階)', () => {
  test('1回(単発)は段階0=平常', () => {
    expect(streakGlowStage(1)).toBe(0);
    expect(streakGlowStage(0)).toBe(0);
  });
  test('連続するほど段階が上がりMAX-1で頭打ち', () => {
    expect(streakGlowStage(2)).toBe(1);
    expect(streakGlowStage(3)).toBe(2);
    expect(streakGlowStage(99)).toBe(STREAK_MAX - 1);
  });
});

describe('streakBubbleLifetimeMs (吹き出し寿命)', () => {
  test('単発は基準のまま', () => {
    expect(streakBubbleLifetimeMs(1, 4000)).toBe(4000);
  });
  test('連続で少し延びるがbase*2で頭打ち', () => {
    expect(streakBubbleLifetimeMs(2, 4000)).toBe(4500);
    expect(streakBubbleLifetimeMs(3, 4000)).toBe(5000);
    expect(streakBubbleLifetimeMs(99, 4000)).toBe(8000);
  });
});
