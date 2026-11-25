import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createCoalescedRefreshScheduler } from './popupStorageRefreshCoalesce.js';
import { resolveListRenderGapMs } from './renderCadence.js';

// v0.1.2226: 横の欄の描き直し(refresh)の間隔も、会場・応援レーンと同じ共通の決まり(renderCadence.js)に従う。
//   遅い PC の実測(CPU 4倍遅く・8コメ/秒)で、描き直しが終わった直後に次が始まり、長いタスクの大半がこれだった。

function clock() {
  let t = 0;
  /** @type {{ at: number, fn: () => void }[]} */
  let timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => { const x = { at: t + ms, fn }; timers.push(x); return x; },
    clearTimer: (x) => { timers = timers.filter((y) => y !== x); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const n = timers[0];
        if (!n || n.at > end) break;
        timers.shift(); t = n.at; n.fn();
      }
      t = end;
    }
  };
}
const HI = { initialDone: true, allHighFreq: true };

/** 8コメ/秒(125ms ごと)を ms のあいだ流して、描き直しの回数を数える。 */
function runFor(sched, c, ms) {
  let runs = 0;
  for (let at = 0; at < ms; at += 125) {
    sched.schedule(HI, () => { runs += 1; });
    c.advance(125);
  }
  return runs;
}

describe('refresh の間隔: renderCadence の共通の決まり', () => {
  it('心拍に余裕があれば今までどおり 450ms', () => {
    const c = clock();
    const s = createCoalescedRefreshScheduler({ throttleMs: 450, maxAdaptiveMs: 60_000, minIntervalMs: () => resolveListRenderGapMs({ baseMs: 0, recentLagMs: 0 }), deps: c });
    expect(s.highFreqIntervalMs()).toBe(450);
    const base = createCoalescedRefreshScheduler({ throttleMs: 450, maxAdaptiveMs: 60_000, deps: clock() });
    expect(base.highFreqIntervalMs()).toBe(450);
  });

  it('詰まり気味(心拍 60ms 以上)は 450ms のまま(400ms は既定より短い)、固まりかけ(200ms 以上)は 800ms に1回まで', () => {
    let lag = 80;
    const c = clock();
    const s = createCoalescedRefreshScheduler({ throttleMs: 450, maxAdaptiveMs: 60_000, minIntervalMs: () => resolveListRenderGapMs({ baseMs: 0, recentLagMs: lag }), deps: c });
    expect(s.highFreqIntervalMs()).toBe(450);
    lag = 250;
    expect(s.highFreqIntervalMs()).toBe(800);
    const runs = runFor(s, c, 8000);
    // 8秒で 800ms ごと = 先頭1回 + 約9回(450ms なら約17回)
    expect(runs).toBeLessThanOrEqual(11);
    expect(runs).toBeGreaterThanOrEqual(9);
    lag = 0;
    expect(s.highFreqIntervalMs()).toBe(450);
  });

  it('間隔を広げても最後の変更は必ず描く(末尾の1回=コメントを取りこぼさない)', () => {
    const c = clock();
    const s = createCoalescedRefreshScheduler({ throttleMs: 450, maxAdaptiveMs: 60_000, minIntervalMs: () => 800, deps: c });
    let runs = 0;
    s.schedule(HI, () => { runs += 1; });
    c.advance(100);
    s.schedule(HI, () => { runs += 1; });
    expect(runs).toBe(1);
    c.advance(699);
    expect(runs).toBe(1);
    c.advance(2);
    expect(runs).toBe(2);
  });

  it('読めない・壊れた値は無視(今までどおり)、上限は maxAdaptiveMs', () => {
    const bad = createCoalescedRefreshScheduler({ throttleMs: 450, minIntervalMs: () => { throw new Error('x'); }, deps: clock() });
    expect(bad.highFreqIntervalMs()).toBe(450);
    const nan = createCoalescedRefreshScheduler({ throttleMs: 450, minIntervalMs: () => NaN, deps: clock() });
    expect(nan.highFreqIntervalMs()).toBe(450);
    const cap = createCoalescedRefreshScheduler({ throttleMs: 450, maxAdaptiveMs: 1500, minIntervalMs: () => 99_999, deps: clock() });
    expect(cap.highFreqIntervalMs()).toBe(1500);
  });

  it('popup の refresh の間隔係は renderCadence と文書の心拍(既存の計器)を渡している', () => {
    const src = fs.readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
    const at = src.indexOf('const coalescedRefreshScheduler = createCoalescedRefreshScheduler({');
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf('});', at));
    expect(block).toMatch(/minIntervalMs: \(\) => resolveListRenderGapMs\(\{ baseMs: 0, recentLagMs: readExtDocRecentLagMs\(\) \}\)/);
  });
});
