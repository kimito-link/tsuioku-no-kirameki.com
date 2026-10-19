import { describe, expect, it, vi } from 'vitest';
import { buildBootTimelineRecord, createLongTaskLog, formatBootTimelineLine, BOOT_TIMELINE_MAX_LONG } from './bootTimeline.js';
import { startBootTimeline } from './bootTimelineBoot.js';
import { markWatchPopupLoadPhase, snapshotWatchPopupPhaseLog } from './watchPopupLoadDiagnostics.js';

describe('createLongTaskLog', () => {
  it('★50ms 以上・開いて8秒以内だけを、時刻順に残す(年表なので長い順にしない)', () => {
    const l = createLongTaskLog();
    l.add(300, 80);
    l.add(100, 49); // 短い
    l.add(9000, 200); // 窓の外
    l.add(120, 300);
    expect(l.snapshot()).toEqual([[300, 80], [120, 300]]);
  });

  it('件数の上限(10)を超えたら足さない・壊れた入力でも落ちない', () => {
    const l = createLongTaskLog();
    for (let i = 0; i < 20; i++) l.add(i * 10, 60);
    expect(l.snapshot()).toHaveLength(BOOT_TIMELINE_MAX_LONG);
    expect(() => l.add(/** @type {any} */ ('x'), /** @type {any} */ (null))).not.toThrow();
  });
});

describe('formatBootTimelineLine(親の起点に直して、親の最初の描画と同じ線上に並べる)', () => {
  const NOW = 5_000_000;
  const rec = buildBootTimelineRecord({
    at: NOW - 3000,
    timeOrigin: 1_000_100, // 子は親より 100ms あとに始まった
    nav: { responseEnd: 20, domInteractive: 300, domContentLoaded: 310, load: 900, firstPaint: 340 },
    longTasks: [[50, 200], [700, 150]],
    phases: [['count_card', 500], ['shade_clear', 800]]
  });

  it('★子の時刻を親の起点に直す(子の+50ms は親の+150ms)', () => {
    const line = formatBootTimelineLine(rec, { timeOrigin: 1_000_000, firstPaintMs: 600 }, NOW);
    expect(line).toContain('親の最初の描画+600ms');
    expect(line).toContain('子の応答終わり+120ms');
    expect(line).toContain('子のDOM構築+400ms');
    expect(line).toContain('子のload+1000ms');
    expect(line).toContain('+150〜350ms(200ms)');
    expect(line).toContain('count_card+600ms');
  });

  it('★親の最初の描画より前に始まった長い処理に ★ を付ける(縞の間を占有していた処理)', () => {
    const line = formatBootTimelineLine(rec, { timeOrigin: 1_000_000, firstPaintMs: 600 }, NOW);
    expect(line).toContain('★+150〜350ms');
    expect(line).not.toContain('★+800〜950ms'); // 描画のあとに始まったもの
    expect(line).toContain('+800〜950ms(150ms)');
  });

  it('★長い処理が無ければ「なし」・親の最初の描画が未取得ならそう言う・原因は断定しない', () => {
    const none = buildBootTimelineRecord({ at: NOW, timeOrigin: 1_000_000, longTasks: [] });
    const line = formatBootTimelineLine(none, { timeOrigin: 1_000_000, firstPaintMs: null }, NOW);
    expect(line).toContain('親の最初の描画 未取得');
    expect(line).toContain('子の長い処理(50ms超・★=親の最初の描画より前に始まった): なし');
    expect(line).not.toMatch(/原因|せい/);
  });

  it('記録が無い・壊れた入力は空', () => {
    expect(formatBootTimelineLine(null, { timeOrigin: 0, firstPaintMs: 1 }, NOW)).toBe('');
    expect(formatBootTimelineLine(/** @type {any} */ ({}), { timeOrigin: 0, firstPaintMs: 1 }, NOW)).toBe('');
  });
});

describe('startBootTimeline', () => {
  it('★子の節目・長い処理・段階を session へ { 年表 } として書く(指定の時刻に2回)', () => {
    let cb = null;
    class PO { constructor(c) { cb = c; } observe() {} disconnect() {} }
    const set = vi.fn(() => Promise.resolve());
    const timers = [];
    const perf = {
      timeOrigin: 42,
      getEntriesByType: () => [{ responseEnd: 10, domInteractive: 200, domContentLoadedEventEnd: 210, loadEventEnd: 800 }],
      getEntriesByName: () => [{ startTime: 250 }]
    };
    markWatchPopupLoadPhase('count_card');
    const o = startBootTimeline({ PerformanceObserverCtor: PO, perf, session: { set }, now: () => 9, setTimeoutRef: (fn, ms) => { timers.push([ms, fn]); return 0; } });
    cb({ getEntries: () => [{ startTime: 100, duration: 120 }] });
    expect(timers.map((t) => t[0])).toEqual([6000, 16000]);
    timers[0][1]();
    const rec = set.mock.calls[0][0].nls_boot_timeline_sidepanel_v1;
    expect(rec.timeOrigin).toBe(42);
    expect(rec.nav).toMatchObject({ domInteractive: 200, load: 800, firstPaint: 250 });
    expect(rec.longTasks).toEqual([[100, 120]]);
    expect(Array.isArray(rec.phases)).toBe(true);
    o.stop();
  });

  it('★longtask を受け付けない環境でも、節目と段階は出す(落ちない)', () => {
    class PO { constructor() {} observe() { throw new TypeError('unsupported'); } disconnect() {} }
    const set = vi.fn(() => Promise.resolve());
    const timers = [];
    const perf = { timeOrigin: 1, getEntriesByType: () => [], getEntriesByName: () => [] };
    const o = startBootTimeline({ PerformanceObserverCtor: PO, perf, session: { set }, setTimeoutRef: (fn) => { timers.push(fn); return 0; } });
    timers[0]();
    expect(set).toHaveBeenCalledTimes(1);
    o.stop();
  });

  it('storage の失敗で例外を出さない', () => {
    class PO { constructor() {} observe() {} disconnect() {} }
    const timers = [];
    const perf = { timeOrigin: 1, getEntriesByType: () => [], getEntriesByName: () => [] };
    startBootTimeline({ PerformanceObserverCtor: PO, perf, session: { set: () => { throw new Error('invalidated'); } }, setTimeoutRef: (fn) => { timers.push(fn); return 0; } });
    expect(() => timers[0]()).not.toThrow();
  });
});

describe('段階の年表(watchPopupLoadDiagnostics)', () => {
  it('★段階名と時刻を残す(読み取りは複製=外から壊されない)', () => {
    markWatchPopupLoadPhase('phase_for_test');
    const a = snapshotWatchPopupPhaseLog();
    expect(a.some((x) => x[0] === 'phase_for_test' && typeof x[1] === 'number')).toBe(true);
    a.length = 0;
    expect(snapshotWatchPopupPhaseLog().length).toBeGreaterThan(0);
  });
});
