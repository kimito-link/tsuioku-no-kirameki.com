import { describe, expect, it, vi } from 'vitest';
import { createTrailingPublisher } from './trailingPublisher.js';

function fakeClock() {
  let t = 0;
  /** @type {{ at: number, fn: () => void }[]} */
  let timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => { const h = { at: t + ms, fn }; timers.push(h); return h; },
    clearTimer: (h) => { timers = timers.filter((x) => x !== h); },
    advance(ms) {
      t += ms;
      const due = timers.filter((x) => x.at <= t);
      timers = timers.filter((x) => x.at > t);
      for (const d of due) d.fn();
    },
    pending: () => timers.length
  };
}

describe('createTrailingPublisher', () => {
  it('最初はすぐ書き、間隔内の呼び出しは最後に1回だけ書く', () => {
    const c = fakeClock();
    const pub = vi.fn();
    const p = createTrailingPublisher(pub, 3000, c);
    p.request();
    expect(pub).toHaveBeenCalledTimes(1);
    c.advance(500); p.request();
    c.advance(500); p.request();
    expect(pub).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(1);
    c.advance(2000);
    expect(pub).toHaveBeenCalledTimes(2); // 止まっても最後の状態が書かれる
    expect(c.pending()).toBe(0);
  });
  it('間引いた呼び出しが無ければ後から書かない', () => {
    const c = fakeClock();
    const pub = vi.fn();
    const p = createTrailingPublisher(pub, 3000, c);
    p.request();
    c.advance(10000);
    expect(pub).toHaveBeenCalledTimes(1);
  });
  it('間隔が空いていればすぐ書く', () => {
    const c = fakeClock();
    const pub = vi.fn();
    const p = createTrailingPublisher(pub, 3000, c);
    p.request();
    c.advance(3500);
    p.request();
    expect(pub).toHaveBeenCalledTimes(2);
  });
  it('書く側が投げても止まらない・cancel で後からの1回を取り消す', () => {
    const c = fakeClock();
    const p = createTrailingPublisher(() => { throw new Error('x'); }, 3000, c);
    expect(() => p.request()).not.toThrow();
    p.request();
    p.cancel();
    expect(c.pending()).toBe(0);
  });
});
