import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRefreshDutyGate, REFRESH_DUTY_MAX_REST_MS, REFRESH_DUTY_QUIET_MAX_REST_MS } from './refreshDutyGate.js';

describe('createRefreshDutyGate', () => {
  it('軽い描き直し(1秒未満)のあとは見送らない', () => {
    const g = createRefreshDutyGate();
    g.noteRun(0, 400);
    expect(g.shouldSkip(401)).toBe(false);
    expect(g.diag.skipped).toBe(0);
  });
  it('重い描き直しのあとは、かかった時間の3倍は見送る', () => {
    const g = createRefreshDutyGate();
    g.noteRun(10_000, 17_000); // 7秒
    g.noteChange(12_000); // 途中で外からの変化があった(静かなときの長い休みには入らない)
    expect(g.shouldSkip(18_000)).toBe(true);
    expect(g.shouldSkip(37_999)).toBe(true);
    expect(g.shouldSkip(38_000)).toBe(false);
    expect(g.diag.lastCostMs).toBe(7000);
    expect(g.diag.lastRestMs).toBe(21_000);
    expect(g.diag.skipped).toBe(2);
  });
  it('休むのは長くても上限まで(止まったままにしない)', () => {
    const g = createRefreshDutyGate();
    g.noteRun(0, 100_000);
    g.noteChange(50_000);
    expect(g.shouldSkip(100_000 + REFRESH_DUTY_MAX_REST_MS - 1)).toBe(true);
    expect(g.shouldSkip(100_000 + REFRESH_DUTY_MAX_REST_MS)).toBe(false);
  });
  it('おかしな時刻は無視する', () => {
    const g = createRefreshDutyGate();
    g.noteRun(NaN, 5);
    g.noteRun(10, 5);
    expect(g.diag.runs).toBe(0);
    expect(g.shouldSkip(NaN)).toBe(false);
  });
});

describe('静かなとき(外からの変化が無い)は長く休む(v0.1.1984)', () => {
  it('重い1回のあと変化が無ければ、3倍の休みが明けても見送る', () => {
    const g = createRefreshDutyGate();
    g.noteRun(10_000, 17_000);
    expect(g.shouldSkip(38_000)).toBe(true);
    expect(g.diag.skippedQuiet).toBe(1);
    expect(g.shouldSkip(17_000 + REFRESH_DUTY_QUIET_MAX_REST_MS - 1)).toBe(true);
    expect(g.shouldSkip(17_000 + REFRESH_DUTY_QUIET_MAX_REST_MS)).toBe(false); // 上限で必ず1回は通す
  });
  it('変化の知らせが来たら、3倍の休みが明けたところで通す', () => {
    const g = createRefreshDutyGate();
    g.noteRun(10_000, 17_000);
    expect(g.shouldSkip(40_000)).toBe(true);
    g.noteChange(41_000);
    expect(g.shouldSkip(42_000)).toBe(false);
    expect(g.diag.changes).toBe(1);
  });
  it('描き直しの最中に来た変化は読み落としているかもしれないので、次は通す', () => {
    const g = createRefreshDutyGate();
    g.noteChange(12_000);
    g.noteRun(10_000, 17_000);
    expect(g.shouldSkip(38_000)).toBe(false);
  });
  it('描き直しが始まる前の変化は、その1回で読んでいるので静かとみなす', () => {
    const g = createRefreshDutyGate();
    g.noteChange(9_000);
    g.noteRun(10_000, 17_000);
    expect(g.shouldSkip(38_000)).toBe(true);
  });
  it('軽い描き直し(1秒未満)のあとは、静かでも見送らない', () => {
    const g = createRefreshDutyGate();
    g.noteRun(0, 400);
    expect(g.shouldSkip(5_000)).toBe(false);
  });
  it('一度も描き直していなければ見送らない', () => {
    const g = createRefreshDutyGate();
    expect(g.shouldSkip(5_000)).toBe(false);
  });
});

describe('popup の配線', () => {
  it('外からの変化(自分の書き込みだけの知らせは除く)を門に知らせる', () => {
    const src2 = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
    const at = src2.indexOf("noteRepaintReason('self_write_skipped');");
    expect(at).toBeGreaterThan(0);
    expect(src2.slice(at, at + 200)).toContain('_refreshDutyGate.noteChange(Date.now(), keys);');
  });
  const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
  it('定期の見回りだけが門を通る(見送るときは数字カードだけ更新)', () => {
    expect(src).toContain('if (_refreshDutyGate.shouldSkip(Date.now())) { void applyLightweightPanelSummaryCards(); return; }');
  });
  it('描き直し1回の時間は safeRefresh で測る', () => {
    expect(src).toContain('_refreshDutyGate.noteRun(_refreshT0, Date.now());');
  });
});
