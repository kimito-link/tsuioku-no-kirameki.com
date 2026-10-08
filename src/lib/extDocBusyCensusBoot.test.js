import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExtDocBusyCensus } from './extDocBusyCensusBoot.js';
import { EXT_CENSUS_MESSAGE_TYPE } from './extProcessCensusKey.js';

/**
 * 各拡張文書で動く常駐部の振る舞い(タイマー・longtask・onChanged・報告)。
 *   ★不変条件: storage には書かない(書き手は SW の1か所)/ 失敗しても本処理を壊さない /
 *               裏タブのタイマー間引きを「遅れ」に数えない / 負荷にならない(タイマーは2本だけ)。
 */

/** @param {Partial<{hidden: boolean, search: string, pathname: string}>} [o] */
function makeEnv(o = {}) {
  let t = 1_000_000;
  const listeners = { onChanged: /** @type {Function[]} */ ([]), longtask: /** @type {Function|null} */ (null) };
  const sent = /** @type {any[]} */ ([]);
  const doc = { hidden: !!o.hidden };
  const env = {
    now: () => t,
    advance: (ms) => { t += ms; },
    doc,
    sent,
    listeners,
    win: {
      location: { pathname: o.pathname ?? '/popup.html', search: o.search ?? '?inline=1&dock=sidepanel' },
      document: doc,
      top: null
    },
    perf: { memory: { usedJSHeapSize: 600 * 1048576, jsHeapSizeLimit: 4096 * 1048576 } },
    chromeApi: {
      runtime: { sendMessage: (m) => { sent.push(m); } },
      storage: {
        onChanged: { addListener: (fn) => { listeners.onChanged.push(fn); } },
        local: { set: vi.fn() }
      }
    },
    PerformanceObserverCtor: class {
      constructor(cb) { listeners.longtask = cb; }
      observe() {}
      disconnect() {}
    },
    randomId: () => 'abcd1234'
  };
  return env;
}

describe('startExtDocBusyCensus', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('報告は {type, report} で、surface と instanceId を持つ。storage には書かない', () => {
    const env = makeEnv();
    const h = startExtDocBusyCensus(env);
    vi.advanceTimersByTime(61_000);
    expect(env.sent.length).toBeGreaterThanOrEqual(1);
    const m = env.sent[env.sent.length - 1];
    expect(m.type).toBe(EXT_CENSUS_MESSAGE_TYPE);
    expect(m.report.s).toBe('popup-sidepanel');
    expect(m.report.i).toBe('abcd1234');
    expect(env.chromeApi.storage.local.set).not.toHaveBeenCalled();
    h.stop();
  });

  it('自分の longtask を犯人側の数字に積む(報告に出る)', () => {
    const env = makeEnv();
    const h = startExtDocBusyCensus(env);
    env.listeners.longtask?.({ getEntries: () => [{ duration: 150 }, { duration: 90 }] });
    vi.advanceTimersByTime(61_000);
    const r = env.sent[env.sent.length - 1].report;
    expect(r.lt).toEqual([2, 240, 150]);
    h.stop();
  });

  it('★top 文書: containerType が window なら自分、iframe なら「他の文書が実行」(lo)', () => {
    const env = makeEnv();
    const h = startExtDocBusyCensus(env);
    env.listeners.longtask?.({ getEntries: () => [
      { duration: 200, attribution: [{ containerType: 'window' }] },
      { duration: 500, attribution: [{ containerType: 'iframe' }] }
    ] });
    vi.advanceTimersByTime(61_000);
    const r = env.sent[env.sent.length - 1].report;
    expect(r.lt).toEqual([1, 200, 200]);
    expect(r.lo).toEqual([1, 500, 500]);
    h.stop();
  });

  it('★iframe 文書(win.top !== win): iframe なら自分/兄弟、window なら「他の文書が実行」(親の処理)', () => {
    const env = makeEnv();
    env.win.top = {}; // 自分は top ではない
    const h = startExtDocBusyCensus(env);
    env.listeners.longtask?.({ getEntries: () => [
      { duration: 300, attribution: [{ containerType: 'iframe' }] },
      { duration: 800, attribution: [{ containerType: 'window' }] }
    ] });
    vi.advanceTimersByTime(61_000);
    const r = env.sent[env.sent.length - 1].report;
    expect(r.lt).toEqual([1, 300, 300]);
    expect(r.lo).toEqual([1, 800, 800]);
    h.stop();
  });

  it('★可視中のハートビートのずれだけを「受けた遅れ」に数える', () => {
    const env = makeEnv();
    const h = startExtDocBusyCensus({ ...env, now: () => Date.now() });
    // 1秒ごとの心拍を、500ms 余計に待たされた体で進める(fake timers の Date を使う)
    vi.advanceTimersByTime(1000);
    vi.setSystemTime(Date.now() + 500);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(61_000);
    const r = env.sent[env.sent.length - 1].report;
    expect(r.lg[1]).toBeGreaterThanOrEqual(400);
    h.stop();
  });

  it('★非表示(裏タブ)のあいだのずれは遅れに数えない(タイマー間引きは忙しさではない)', () => {
    const env = makeEnv({ hidden: true });
    const h = startExtDocBusyCensus({ ...env, now: () => Date.now() });
    vi.advanceTimersByTime(1000);
    vi.setSystemTime(Date.now() + 5000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(61_000);
    const r = env.sent[env.sent.length - 1].report;
    expect(r.lg).toEqual([0, 0, 0]);
    h.stop();
  });

  it('storage.onChanged(local)をキー族別に数える。local 以外は数えない', () => {
    const env = makeEnv();
    const h = startExtDocBusyCensus(env);
    const fn = env.listeners.onChanged[0];
    fn({ nls_lane_mirror_v1: { newValue: { a: 'x'.repeat(2048) } }, nls_comments_lv123: { newValue: 1 } }, 'local');
    fn({ nls_other_v1: { newValue: 1 } }, 'sync');
    vi.advanceTimersByTime(61_000);
    const oc = env.sent[env.sent.length - 1].report.oc;
    expect(oc.map((x) => x[0]).sort()).toEqual(['nls_comments_*', 'nls_lane_mirror_v1']);
    h.stop();
  });

  it('ヒープ(performance.memory)を報告に載せる', () => {
    const env = makeEnv();
    const h = startExtDocBusyCensus(env);
    vi.advanceTimersByTime(61_000);
    expect(env.sent[env.sent.length - 1].report.hp).toEqual([600, 4096]);
    h.stop();
  });

  it('★壊れても本処理を壊さない: PerformanceObserver が無い・sendMessage が投げる環境でも例外を出さない', () => {
    const env = makeEnv();
    env.PerformanceObserverCtor = null;
    env.chromeApi.runtime.sendMessage = () => { throw new Error('Extension context invalidated.'); };
    expect(() => {
      const h = startExtDocBusyCensus(env);
      vi.advanceTimersByTime(61_000);
      h.stop();
    }).not.toThrow();
  });

  it('★負荷にならない: setInterval は 2 本(心拍1秒・報告60秒)だけ。stop で全部止まる', () => {
    const env = makeEnv();
    const spy = vi.spyOn(globalThis, 'setInterval');
    const before = spy.mock.calls.length;
    const h = startExtDocBusyCensus(env);
    expect(spy.mock.calls.length - before).toBe(2);
    h.stop();
    const sentBefore = env.sent.length;
    vi.advanceTimersByTime(120_000);
    expect(env.sent.length).toBe(sentBefore);
    spy.mockRestore();
  });
});
