import { describe, it, expect } from 'vitest';
import { createCoalescedRefreshScheduler } from './popupStorageRefreshCoalesce.js';

/**
 * タイマーと時計をインジェクトする最小モック。
 * - advance(ms) で時間を進め、期限到来した setTimer コールバックを発火順に実行する。
 */
function createClock() {
  let t = 0;
  /** @type {{id:number, at:number, fn:()=>void}[]} */
  const timers = [];
  let seq = 0;
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.push({ id, at: t + Math.max(0, ms), fn });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (ms) => {
      const target = t + ms;
      while (true) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > target) break;
        t = next.at;
        timers.shift();
        next.fn();
      }
      t = target;
    }
  };
}

describe('createCoalescedRefreshScheduler', () => {
  it('初回（initialDone=false）は即時 refresh を呼ぶ', () => {
    const clock = createClock();
    const sched = createCoalescedRefreshScheduler({
      throttleMs: 450,
      deps: clock
    });
    let calls = 0;
    sched.schedule({ allHighFreq: true, initialDone: false }, () => calls++);
    expect(calls).toBe(1);
  });

  it('非高頻度キーは常に即時 refresh（ペンディングを吹き飛ばす）', () => {
    const clock = createClock();
    const sched = createCoalescedRefreshScheduler({ deps: clock });
    let calls = 0;
    const run = () => calls++;
    sched.schedule({ allHighFreq: true, initialDone: true }, run); // leading
    expect(calls).toBe(1);
    sched.schedule({ allHighFreq: true, initialDone: true }, run); // suppressed trailing
    sched.schedule({ allHighFreq: false, initialDone: true }, run); // 即時
    expect(calls).toBe(2);
  });

  it('高頻度変更の先行描画: 初回は即時、throttle 直後は抑制', () => {
    const clock = createClock();
    const sched = createCoalescedRefreshScheduler({
      throttleMs: 450,
      deps: clock
    });
    let calls = 0;
    const run = () => calls++;
    sched.schedule({ allHighFreq: true, initialDone: true }, run);
    expect(calls).toBe(1); // leading
    sched.schedule({ allHighFreq: true, initialDone: true }, run);
    expect(calls).toBe(1); // suppressed, trailing scheduled
    clock.advance(449);
    expect(calls).toBe(1); // trailing not yet
    clock.advance(1);
    expect(calls).toBe(2); // trailing fired at t=450
  });

  it('連続バースト下でも throttleMs ごとに一度は refresh が走る', () => {
    const clock = createClock();
    const sched = createCoalescedRefreshScheduler({
      throttleMs: 450,
      deps: clock
    });
    let calls = 0;
    const run = () => calls++;
    // t=0..2000 まで 50ms ごとに change を浴びせる
    for (let t = 0; t <= 2000; t += 50) {
      sched.schedule({ allHighFreq: true, initialDone: true }, run);
      clock.advance(50);
    }
    // 450ms 周期で paint されるはず: t=0, 450, 900, 1350, 1800 の 5 回以上
    expect(calls).toBeGreaterThanOrEqual(5);
    // max-wait 2200ms 間隔より有意に速い
    expect(calls).toBeGreaterThanOrEqual(4);
  });

  it('静かな変更は 1 回の trailing で終わる（余分な refresh を生まない）', () => {
    const clock = createClock();
    const sched = createCoalescedRefreshScheduler({
      throttleMs: 450,
      deps: clock
    });
    let calls = 0;
    const run = () => calls++;
    sched.schedule({ allHighFreq: true, initialDone: true }, run); // leading
    clock.advance(100);
    sched.schedule({ allHighFreq: true, initialDone: true }, run); // trailing scheduled @t=450
    clock.advance(5_000);
    expect(calls).toBe(2); // leading + trailing のみ
  });

  it('trailing は延長されない（デバウンスのようにタイマーが伸びない）', () => {
    const clock = createClock();
    const sched = createCoalescedRefreshScheduler({
      throttleMs: 450,
      deps: clock
    });
    let calls = 0;
    const run = () => calls++;
    sched.schedule({ allHighFreq: true, initialDone: true }, run); // leading @0
    // 50ms ごとに変更を浴びせ続ける（デバウンスならここで永遠にリセットされる）
    for (let step = 0; step < 9; step++) {
      clock.advance(50);
      sched.schedule({ allHighFreq: true, initialDone: true }, run);
    }
    // t=450 の時点で trailing が必ず走っていることを確認
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('cancel でペンディングタイマーがクリアされる', () => {
    const clock = createClock();
    const sched = createCoalescedRefreshScheduler({
      throttleMs: 450,
      deps: clock
    });
    let calls = 0;
    const run = () => calls++;
    sched.schedule({ allHighFreq: true, initialDone: true }, run); // leading
    sched.schedule({ allHighFreq: true, initialDone: true }, run); // trailing scheduled
    sched.cancel();
    clock.advance(5_000);
    expect(calls).toBe(1); // trailing は取り消された
  });
});
