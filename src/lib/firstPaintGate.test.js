import { describe, expect, it } from 'vitest';
import { createFirstPaintGate } from './firstPaintGate.js';

const fakeTimer = () => { const q = []; return { later: (fn) => { q.push(fn); return 0; }, fire: () => { while (q.length) q.shift()(); } }; };
const fakeObserver = () => { let cb = null; class PO { constructor(c) { cb = c; this.observed = null; } observe(o) { this.observed = o; } disconnect() { this.disconnected = true; } } return { PO, trigger: () => cb && cb([]) }; };

describe('createFirstPaintGate', () => {
  it('★最初の描画が既に済んでいれば、すぐ開く', async () => {
    const g = createFirstPaintGate({ hasFirstPaint: () => true });
    expect(g.isOpen()).toBe(true);
    await g.promise;
  });

  it('★最初の描画がまだなら閉じていて、paint の通知で開く', async () => {
    const o = fakeObserver(); const t = fakeTimer();
    const g = createFirstPaintGate({ hasFirstPaint: () => false, PerformanceObserverCtor: o.PO, setTimeoutRef: t.later });
    expect(g.isOpen()).toBe(false);
    o.trigger();
    await g.promise;
    expect(g.isOpen()).toBe(true);
  });

  it('★描画が来なくても、時間切れ(既定600ms)で必ず開く=黒いままの測定は失われない', async () => {
    const o = fakeObserver(); const t = fakeTimer();
    const g = createFirstPaintGate({ hasFirstPaint: () => false, PerformanceObserverCtor: o.PO, setTimeoutRef: (fn, ms) => { expect(ms).toBe(600); return t.later(fn); } });
    expect(g.isOpen()).toBe(false);
    t.fire();
    await g.promise;
    expect(g.isOpen()).toBe(true);
  });

  it('★PerformanceObserver が無い・使えない環境は、すぐ開く(従来どおり測る)', async () => {
    expect(createFirstPaintGate({ hasFirstPaint: () => false, PerformanceObserverCtor: null }).isOpen()).toBe(true);
    const bad = class { constructor() { throw new Error('x'); } };
    expect(createFirstPaintGate({ hasFirstPaint: () => false, PerformanceObserverCtor: bad }).isOpen()).toBe(true);
  });

  it('二重に開いても落ちない', async () => {
    const o = fakeObserver(); const t = fakeTimer();
    const g = createFirstPaintGate({ hasFirstPaint: () => false, PerformanceObserverCtor: o.PO, setTimeoutRef: t.later });
    o.trigger(); t.fire(); o.trigger();
    await g.promise;
    expect(g.isOpen()).toBe(true);
  });
});
