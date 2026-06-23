import { describe, it, expect } from 'vitest';
import {
  judgeWhiteoutTransition,
  recordWhiteoutSample,
  summarizeWhiteoutDiag,
  WHITEOUT_SAMPLE_CAP
} from './scrollWhiteoutProbe.js';

describe('judgeWhiteoutTransition', () => {
  it('可視(prevH大)→消失(nowH≈0)は白化と判定', () => {
    expect(judgeWhiteoutTransition({ prevH: 360, nowH: 0, visibleNow: true })).toBe(true);
  });
  it('可視→非表示(visibleNow=false)も白化', () => {
    expect(judgeWhiteoutTransition({ prevH: 360, nowH: 360, visibleNow: false })).toBe(true);
  });
  it('ずっと可視(消えていない)は白化でない', () => {
    expect(judgeWhiteoutTransition({ prevH: 360, nowH: 360, visibleNow: true })).toBe(false);
  });
  it('元々隠れていた(prevH小)→消失は白化と数えない(誤検知回避)', () => {
    expect(judgeWhiteoutTransition({ prevH: 0, nowH: 0, visibleNow: true })).toBe(false);
  });
  it('境界: prevH=50 かつ nowH=10 は白化(可視→消失の閾値)', () => {
    expect(judgeWhiteoutTransition({ prevH: 50, nowH: 10, visibleNow: true })).toBe(true);
  });
  it('境界: prevH=49(可視未満)は白化でない', () => {
    expect(judgeWhiteoutTransition({ prevH: 49, nowH: 0, visibleNow: true })).toBe(false);
  });
});

describe('recordWhiteoutSample', () => {
  it('白化サンプルで count と lastAtMs が増える', () => {
    const st = { count: 0, samples: [], lastAtMs: 0 };
    recordWhiteoutSample(st, { kind: 'video', prevH: 360, nowH: 0, visibleNow: true, atMs: 1000 });
    expect(st.count).toBe(1);
    expect(st.lastAtMs).toBe(1000);
    expect(st.samples).toHaveLength(1);
    expect(st.samples[0].kind).toBe('video');
  });
  it('白化でないサンプルは count を増やさない', () => {
    const st = { count: 0, samples: [], lastAtMs: 0 };
    recordWhiteoutSample(st, { kind: 'video', prevH: 360, nowH: 360, visibleNow: true, atMs: 1000 });
    expect(st.count).toBe(0);
    expect(st.samples).toHaveLength(0);
  });
  it('samples はリングバッファで CAP 件に制限される', () => {
    const st = { count: 0, samples: [], lastAtMs: 0 };
    for (let i = 0; i < WHITEOUT_SAMPLE_CAP + 3; i++) {
      recordWhiteoutSample(st, { kind: 'host', prevH: 200, nowH: 0, visibleNow: true, atMs: 100 + i });
    }
    expect(st.count).toBe(WHITEOUT_SAMPLE_CAP + 3);
    expect(st.samples).toHaveLength(WHITEOUT_SAMPLE_CAP);
    // 最新が末尾
    expect(st.samples[st.samples.length - 1].atMs).toBe(100 + WHITEOUT_SAMPLE_CAP + 2);
  });
});

describe('summarizeWhiteoutDiag', () => {
  it('未発生なら count=0 / lastWhiteoutAgoMs=null', () => {
    const out = summarizeWhiteoutDiag({ count: 0, samples: [], lastAtMs: 0 }, 5000);
    expect(out.whiteoutCount).toBe(0);
    expect(out.lastWhiteoutAgoMs).toBeNull();
    expect(out.samples).toEqual([]);
  });
  it('発生済みなら ago を now-lastAtMs で出す', () => {
    const out = summarizeWhiteoutDiag({ count: 2, samples: [{ kind: 'video' }], lastAtMs: 4000 }, 5000);
    expect(out.whiteoutCount).toBe(2);
    expect(out.lastWhiteoutAgoMs).toBe(1000);
  });
  it('null state でも落ちない', () => {
    const out = summarizeWhiteoutDiag(null, 5000);
    expect(out.whiteoutCount).toBe(0);
    expect(out.lastWhiteoutAgoMs).toBeNull();
  });
});
