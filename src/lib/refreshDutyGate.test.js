import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRefreshDutyGate, REFRESH_DUTY_MAX_REST_MS } from './refreshDutyGate.js';

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

describe('popup の配線', () => {
  const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
  it('定期の見回りだけが門を通る(見送るときは数字カードだけ更新)', () => {
    expect(src).toContain('if (_refreshDutyGate.shouldSkip(Date.now())) { void applyLightweightPanelSummaryCards(); return; }');
  });
  it('描き直し1回の時間は safeRefresh で測る', () => {
    expect(src).toContain('_refreshDutyGate.noteRun(_refreshT0, Date.now());');
  });
});
