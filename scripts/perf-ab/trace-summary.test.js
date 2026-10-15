import { describe, expect, it } from 'vitest';
import { summarizeTraceEvents } from './trace-summary.mjs';

/** 2026-10-16: トレースの self time 集計(子の時間を親から引く)。 */
const meta = (pid, tid, name) => ({ ph: 'M', name: 'thread_name', pid, tid, args: { name } });
const x = (name, ts, dur, pid = 1, tid = 1) => ({ ph: 'X', name, ts, dur, pid, tid });

describe('summarizeTraceEvents', () => {
  it('★親の self time は、子の時間を引いた残り(入れ子を二重に数えない)', () => {
    const ev = [meta(1, 1, 'CrRendererMain'), x('RunTask', 0, 10_000), x('Layout', 1_000, 3_000), x('Paint', 5_000, 2_000)];
    const [t] = summarizeTraceEvents(ev);
    const m = Object.fromEntries(t.rows);
    expect(m.RunTask).toBe(5); // 10 - 3 - 2
    expect(m.Layout).toBe(3);
    expect(m.Paint).toBe(2);
    expect(t.busyMs).toBe(10); // 合計は元の RunTask の長さと一致
  });
  it('★さらに深い入れ子でも合計が崩れない', () => {
    const ev = [meta(1, 1, 'CrRendererMain'), x('RunTask', 0, 100_000), x('FunctionCall', 10_000, 60_000), x('Layout', 20_000, 30_000), x('Paint', 80_000, 10_000)];
    const [t] = summarizeTraceEvents(ev);
    const m = Object.fromEntries(t.rows);
    expect(m.Layout).toBe(30);
    expect(m.FunctionCall).toBe(30); // 60 - 30
    expect(m.RunTask).toBe(30); // 100 - 60 - 10
    expect(t.busyMs).toBe(100);
  });
  it('★メインスレッド以外(コンポジタ等)は数えない・忙しい順に並べる', () => {
    const ev = [
      meta(1, 1, 'CrRendererMain'), meta(1, 2, 'Compositor'), meta(2, 1, 'CrRendererMain'),
      x('RunTask', 0, 5_000, 1, 1), x('RunTask', 0, 9_000, 1, 2), x('RunTask', 0, 8_000, 2, 1)
    ];
    const out = summarizeTraceEvents(ev);
    expect(out.map((t) => t.pid)).toEqual([2, 1]);
    expect(out.every((t) => /Main/.test(t.thread))).toBe(true);
  });
  it('不正な入力(空・dur 無し)でも落ちない', () => {
    expect(summarizeTraceEvents([])).toEqual([]);
    expect(summarizeTraceEvents([meta(1, 1, 'CrRendererMain'), { ph: 'X', name: 'a', ts: 0, pid: 1, tid: 1 }])).toEqual([]);
  });
});
