import { describe, it, expect } from 'vitest';
import {
  SLOW_FOLLOWER_FETCH_MS,
  createSlowFollowerFetch,
  slowFollowerFetchAdvance,
  slowFollowerFetchDue,
  freshSlowFollowerClock,
} from './slowFollowerFetch.js';

const T0 = 1_700_000_000_000;

describe('人数を読む間隔', () => {
  it('開始は1回、その後は5分、隠れている間は読まない', () => {
    const clock = freshSlowFollowerClock();
    expect(slowFollowerFetchDue(clock, T0, { hasTarget: true })).toBe(true);
    expect(slowFollowerFetchDue(clock, T0, { hasTarget: true, hidden: true })).toBe(false);
    const next = slowFollowerFetchAdvance(clock, T0, true);
    expect(slowFollowerFetchDue(next, T0 + SLOW_FOLLOWER_FETCH_MS - 1, { hasTarget: true })).toBe(false);
    expect(slowFollowerFetchDue(next, T0 + SLOW_FOLLOWER_FETCH_MS, { hasTarget: true })).toBe(true);
    expect(slowFollowerFetchDue(next, T0 + 20_000, { hasTarget: true, force: true })).toBe(true);
    expect(slowFollowerFetchDue(next, T0 + 10_000, { hasTarget: true, force: true })).toBe(false);
  });
  it('失敗すると5分、10分、20分と間をあける', () => {
    let clock = freshSlowFollowerClock();
    clock = slowFollowerFetchAdvance(clock, T0, false);
    expect(clock.nextAt - T0).toBe(SLOW_FOLLOWER_FETCH_MS);
    clock = slowFollowerFetchAdvance(clock, clock.nextAt, false);
    expect(clock.failStreak).toBe(2);
    expect(clock.nextAt - (T0 + SLOW_FOLLOWER_FETCH_MS)).toBe(SLOW_FOLLOWER_FETCH_MS * 2);
    clock = slowFollowerFetchAdvance(clock, clock.nextAt, false);
    expect(clock.nextAt - clock.lastTryAt).toBe(SLOW_FOLLOWER_FETCH_MS * 4);
    clock = slowFollowerFetchAdvance(clock, clock.nextAt, true);
    expect(clock.failStreak).toBe(0);
    expect(clock.nextAt - clock.lastTryAt).toBe(SLOW_FOLLOWER_FETCH_MS);
  });
  it('読んでる間は次を始めない。配信が変わったら最初から', () => {
    const gate = createSlowFollowerFetch();
    const first = gate.claim('tw.a.1', { now: T0 });
    expect(first).toBeGreaterThan(0);
    expect(gate.claim('tw.a.1', { now: T0 + 1000 })).toBe(0);
    gate.finish(first, true, T0);
    expect(gate.claim('tw.a.1', { now: T0 + 1000 })).toBe(0);
    const second = gate.claim('tw.b.2', { now: T0 + 1000 });
    expect(second).toBeGreaterThan(0);
    expect(gate.currentKey()).toBe('tw.b.2');
  });
});
