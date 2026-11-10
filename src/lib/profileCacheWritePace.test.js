import { describe, it, expect } from 'vitest';
import {
  createProfileCacheWritePacer,
  profileCacheWriteGapMs,
  PROFILE_CACHE_PACE_FREE_PEOPLE,
  PROFILE_CACHE_PACE_GAP_MS
} from './profileCacheWritePace.js';

function harness() {
  let t = 1000;
  /** @type {{fn: () => void, at: number}[]} */
  const timers = [];
  let flushes = 0;
  const pacer = createProfileCacheWritePacer({
    flush: () => { flushes += 1; },
    now: () => t,
    setTimer: (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length; }
  });
  return {
    pacer,
    advance(ms) {
      t += ms;
      for (const x of [...timers]) {
        if (x.at <= t) { timers.splice(timers.indexOf(x), 1); x.fn(); }
      }
    },
    get flushes() { return flushes; },
    get timerCount() { return timers.length; }
  };
}

describe('profileCacheWritePace', () => {
  it('小さい控えは毎回書く(従来どおり)', () => {
    expect(profileCacheWriteGapMs(PROFILE_CACHE_PACE_FREE_PEOPLE)).toBe(0);
    const h = harness();
    for (let i = 0; i < 5; i += 1) expect(h.pacer.offer(100)).toBe(true);
    expect(h.timerCount).toBe(0);
  });

  it('大きい控えは間隔内を後回しにし、最後に1回だけ書かせる', () => {
    const h = harness();
    expect(h.pacer.offer(6500)).toBe(true);
    h.advance(1000);
    expect(h.pacer.offer(6500)).toBe(false);
    h.advance(1000);
    expect(h.pacer.offer(6500)).toBe(false);
    expect(h.timerCount).toBe(1);
    h.advance(PROFILE_CACHE_PACE_GAP_MS);
    expect(h.flushes).toBe(1);
    expect(h.pacer.diag).toMatchObject({ now: 1, deferred: 2, flushedLater: 1 });
  });

  it('間隔が空けばまたすぐ書ける', () => {
    const h = harness();
    expect(h.pacer.offer(6500)).toBe(true);
    h.advance(PROFILE_CACHE_PACE_GAP_MS);
    expect(h.pacer.offer(6500)).toBe(true);
    expect(h.flushes).toBe(0);
  });
});
