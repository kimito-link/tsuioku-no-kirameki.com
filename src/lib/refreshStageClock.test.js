import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRefreshStageClock } from './refreshStageClock.js';

describe('createRefreshStageClock', () => {
  it('いまいる段と、終わった1回の段ごとの時間を残す', () => {
    const c = createRefreshStageClock();
    expect(c.diag.stage).toBe('idle');
    c.begin(1000);
    expect(c.diag.stage).toBe('start');
    c.enter('tabs', 1010);
    c.enter('lightRead', 1200);
    expect(c.diag.stage).toBe('lightRead');
    expect(c.diag.stageSinceMs).toBe(1200);
    c.enter('apply', 5200);
    c.end(6000);
    expect(c.diag.stage).toBe('idle');
    expect(c.diag.lastTotals).toEqual({ start: 10, tabs: 190, lightRead: 4000, apply: 800 });
    expect(c.diag.lastTotalMs).toBe(5000);
    expect(c.diag.maxStage).toBe('lightRead');
    expect(c.diag.maxStageMs).toBe(4000);
    expect(c.diag.runs).toBe(1);
  });
  it('同じ段に2回入ったら足す', () => {
    const c = createRefreshStageClock();
    c.begin(0);
    c.enter('a', 10);
    c.enter('b', 20);
    c.enter('a', 50);
    c.end(100);
    expect(c.diag.lastTotals).toEqual({ start: 10, a: 60, b: 30 });
  });
  it('始まっていないときの enter・end は何もしない', () => {
    const c = createRefreshStageClock();
    c.enter('x', 5);
    c.end(10);
    expect(c.diag.stage).toBe('idle');
    expect(c.diag.runs).toBe(0);
    expect(c.diag.lastTotals).toEqual({});
  });
  it('終わる前に次が始まったら、前の分は捨てて数え直す', () => {
    const c = createRefreshStageClock();
    c.begin(0);
    c.enter('a', 10);
    c.begin(100);
    c.end(130);
    expect(c.diag.lastTotals).toEqual({ start: 30 });
    expect(c.diag.runs).toBe(2);
  });
});

describe('popup の配線', () => {
  const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
  it('描き直しの始まりと終わりで計器を動かし、値を globalThis に出す', () => {
    expect(src).toContain('_refreshStageClock.begin(t0);');
    expect(src).toContain('_refreshStageClock.end(Date.now());');
    expect(src).toContain('__refreshStageDiag = _refreshStageClock.diag');
  });
  it('待ちのある段の入口に印がある', () => {
    for (const name of ['tabs', 'dataBacked', 'lightRead', 'apply', 'paint', 'snapshot', 'intercept']) {
      expect(src).toContain(`_refreshStageClock.enter('${name}', Date.now());`);
    }
  });
});
