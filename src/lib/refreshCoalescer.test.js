import { describe, expect, it } from 'vitest';
import { createRefreshCoalescer } from './refreshCoalescer.js';

/** 手動で進められる実行: run() が呼ばれるたび、finish() で完了させる。 */
function manualRun() {
  const pending = [];
  let calls = 0;
  return {
    run: () => { calls += 1; return new Promise((res, rej) => pending.push({ res, rej })); },
    calls: () => calls,
    finish: (i = 0) => pending[i].res(),
    fail: (i = 0, e = new Error('boom')) => pending[i].rej(e)
  };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const noGap = { gapMs: 0, setTimer: (fn) => { fn(); return 0; } };

describe('createRefreshCoalescer', () => {
  it('★実行中でなければ、すぐ1回走る', async () => {
    const m = manualRun();
    const c = createRefreshCoalescer(m.run, noGap);
    const p = c.request();
    expect(m.calls()).toBe(1);
    m.finish(0);
    await p;
    expect(c.isRunning()).toBe(false);
  });

  it('★実行中に来た要求は、何回来ても「あとで1回」にまとめる(並走しない)', async () => {
    const m = manualRun();
    const c = createRefreshCoalescer(m.run, noGap);
    const p1 = c.request();
    c.request(); c.request(); c.request(); c.request();
    expect(m.calls()).toBe(1); // 並走しない
    m.finish(0);
    await flush();
    expect(m.calls()).toBe(2); // まとめた1回だけが走る
    m.finish(1);
    await p1;
    expect(m.calls()).toBe(2);
    expect(c.isRunning()).toBe(false);
  });

  it('★まとめた要求の呼び手にも、最後の実行が終わってから返す(古い結果のまま先へ進ませない)', async () => {
    const m = manualRun();
    const c = createRefreshCoalescer(m.run, noGap);
    const p1 = c.request();
    const p2 = c.request();
    let done = false;
    void p2.then(() => { done = true; });
    m.finish(0);
    await flush();
    expect(done).toBe(false);
    m.finish(1);
    await p2;
    expect(done).toBe(true);
    await p1;
  });

  it('★実行が失敗しても詰まらない(次の要求で走る)・まとめた分も走る', async () => {
    const m = manualRun();
    const c = createRefreshCoalescer(m.run, noGap);
    const p1 = c.request();
    c.request();
    m.fail(0);
    await flush();
    expect(m.calls()).toBe(2);
    m.finish(1);
    await expect(p1).rejects.toThrow('boom');
    expect(c.isRunning()).toBe(false);
    const p3 = c.request();
    expect(m.calls()).toBe(3);
    m.finish(2);
    await p3;
  });

  it('★連続して走らせる間に、呼吸の間(gapMs)を置く', async () => {
    const m = manualRun();
    /** @type {Array<[() => void, number]>} */
    const timers = [];
    const c = createRefreshCoalescer(m.run, { gapMs: 120, setTimer: (fn, ms) => { timers.push([fn, ms]); return 0; } });
    const p = c.request();
    c.request();
    m.finish(0);
    await flush();
    expect(m.calls()).toBe(1); // 間が空くまで走らない
    expect(timers[0][1]).toBe(120);
    timers[0][0]();
    await flush();
    expect(m.calls()).toBe(2);
    m.finish(1);
    await p;
  });

  it('run が同期で例外を投げても詰まらない', async () => {
    let n = 0;
    const c = createRefreshCoalescer(() => { n += 1; if (n === 1) throw new Error('sync'); return Promise.resolve(); }, noGap);
    await expect(c.request()).rejects.toThrow('sync');
    await c.request();
    expect(n).toBe(2);
  });
});
