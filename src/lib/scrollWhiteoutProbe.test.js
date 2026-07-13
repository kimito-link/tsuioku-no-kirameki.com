import { describe, it, expect } from 'vitest';
import {
  judgeWhiteoutTransition,
  recordWhiteoutSample,
  summarizeWhiteoutDiag,
  classifyWhiteoutCulprit,
  WHITEOUT_SAMPLE_CAP,
  WHITEOUT_CULPRIT_MOVE_WINDOW_MS
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

describe('classifyWhiteoutCulprit', () => {
  it('閾値以内の移設ありは move', () => {
    expect(classifyWhiteoutCulprit({ lastMoveAgoMs: 0 })).toBe('move');
    expect(classifyWhiteoutCulprit({ lastMoveAgoMs: WHITEOUT_CULPRIT_MOVE_WINDOW_MS })).toBe('move');
  });
  it('閾値超えの移設は repaint', () => {
    expect(classifyWhiteoutCulprit({ lastMoveAgoMs: WHITEOUT_CULPRIT_MOVE_WINDOW_MS + 1 })).toBe('repaint');
  });
  it('移設記録なし(null)は repaint', () => {
    expect(classifyWhiteoutCulprit({ lastMoveAgoMs: null })).toBe('repaint');
  });
  it('移設記録なし(undefined)は repaint', () => {
    expect(classifyWhiteoutCulprit({})).toBe('repaint');
  });
});

describe('recordWhiteoutSample の W-1 相関計器拡張', () => {
  it('直近に host 移設があれば culpritMove が増え、サンプルに詳細が残る', () => {
    const st = { count: 0, samples: [], lastAtMs: 0 };
    recordWhiteoutSample(st, {
      kind: 'host',
      prevH: 360,
      nowH: 0,
      visibleNow: true,
      atMs: 2000,
      lastMoveReason: 'anchored_video',
      lastMoveAgoMs: 500,
      hostDisplay: 'none',
      hostVisibility: 'visible'
    });
    expect(st.culpritMove).toBe(1);
    expect(st.culpritRepaint).toBe(0);
    expect(st.samples[0].culprit).toBe('move');
    expect(st.samples[0].lastMoveReason).toBe('anchored_video');
    expect(st.samples[0].hostDisplay).toBe('none');
  });
  it('移設記録が無ければ culpritRepaint が増える', () => {
    const st = { count: 0, samples: [], lastAtMs: 0 };
    recordWhiteoutSample(st, {
      kind: 'host',
      prevH: 360,
      nowH: 0,
      visibleNow: true,
      atMs: 2000,
      lastMoveReason: '',
      lastMoveAgoMs: null,
      hostDisplay: 'none',
      hostVisibility: 'visible'
    });
    expect(st.culpritMove).toBe(0);
    expect(st.culpritRepaint).toBe(1);
    expect(st.samples[0].culprit).toBe('repaint');
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
    expect(out.culpritMove).toBe(0);
    expect(out.culpritRepaint).toBe(0);
  });
  it('culpritMove/culpritRepaint をそのまま出す', () => {
    const out = summarizeWhiteoutDiag(
      { count: 2, samples: [], lastAtMs: 4000, culpritMove: 1, culpritRepaint: 1 },
      5000
    );
    expect(out.culpritMove).toBe(1);
    expect(out.culpritRepaint).toBe(1);
  });
});
