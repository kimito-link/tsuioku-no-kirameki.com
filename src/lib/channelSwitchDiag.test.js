import { describe, it, expect } from 'vitest';
import {
  makeInitialChannelSwitchDiag,
  applyChannelSwitchDiagDelta,
  computeChannelSwitchPaintGapAverage,
  buildChannelSwitchDiagSnapshot,
  buildChannelSwitchDiagLines
} from './channelSwitchDiag.js';

describe('makeInitialChannelSwitchDiag', () => {
  it('初期 state は全ゼロ/-1', () => {
    expect(makeInitialChannelSwitchDiag()).toEqual({
      sentCount: 0,
      receivedCount: 0,
      rejectedCount: 0,
      lastSwitchToPaintMs: -1,
      avgSwitchToPaintMs: -1,
      lastEventAt: 0
    });
  });
});

describe('applyChannelSwitchDiagDelta', () => {
  it('カウンタは加算、lastEventAt は置換', () => {
    const s1 = applyChannelSwitchDiagDelta(null, { sentCount: 1, lastEventAt: 100 });
    expect(s1.sentCount).toBe(1);
    expect(s1.lastEventAt).toBe(100);
    const s2 = applyChannelSwitchDiagDelta(s1, { sentCount: 1, lastEventAt: 200 });
    expect(s2.sentCount).toBe(2);
    expect(s2.lastEventAt).toBe(200);
  });

  it('lastSwitchToPaintMs/avgSwitchToPaintMs は置換(加算しない)', () => {
    const s1 = applyChannelSwitchDiagDelta(null, {
      receivedCount: 1,
      lastSwitchToPaintMs: 50,
      avgSwitchToPaintMs: 50
    });
    const s2 = applyChannelSwitchDiagDelta(s1, {
      receivedCount: 1,
      lastSwitchToPaintMs: 90,
      avgSwitchToPaintMs: 62
    });
    expect(s2.lastSwitchToPaintMs).toBe(90);
    expect(s2.avgSwitchToPaintMs).toBe(62);
  });

  it('delta 未指定フィールドは既存値を保持', () => {
    const s1 = applyChannelSwitchDiagDelta(null, { sentCount: 3 });
    const s2 = applyChannelSwitchDiagDelta(s1, { receivedCount: 1 });
    expect(s2.sentCount).toBe(3);
    expect(s2.receivedCount).toBe(1);
  });
});

describe('computeChannelSwitchPaintGapAverage', () => {
  it('初回サンプルはそのまま丸めて採用', () => {
    expect(computeChannelSwitchPaintGapAverage(-1, 120)).toBe(120);
  });

  it('EMA で平均へ寄せる', () => {
    const avg1 = computeChannelSwitchPaintGapAverage(-1, 100);
    const avg2 = computeChannelSwitchPaintGapAverage(avg1, 200);
    expect(avg2).toBe(Math.round(100 + 0.3 * (200 - 100)));
  });

  it('負値/非数のサンプルは直前値を素通しする', () => {
    expect(computeChannelSwitchPaintGapAverage(50, -5)).toBe(50);
    expect(computeChannelSwitchPaintGapAverage(50, NaN)).toBe(50);
    expect(computeChannelSwitchPaintGapAverage(-1, NaN)).toBe(-1);
  });
});

describe('buildChannelSwitchDiagSnapshot', () => {
  it('欠損は初期値で埋め capturedAt を付ける', () => {
    const snap = buildChannelSwitchDiagSnapshot({ sentCount: 2 }, 5000);
    expect(snap).toEqual({
      sentCount: 2,
      receivedCount: 0,
      rejectedCount: 0,
      lastSwitchToPaintMs: -1,
      avgSwitchToPaintMs: -1,
      lastEventAt: 0,
      capturedAt: 5000
    });
  });

  it('不正/null は初期値にフォールバック', () => {
    expect(buildChannelSwitchDiagSnapshot(null, 100).sentCount).toBe(0);
    expect(buildChannelSwitchDiagSnapshot(undefined, 100).avgSwitchToPaintMs).toBe(-1);
  });
});

describe('buildChannelSwitchDiagLines', () => {
  it('未観測(送信も受信も0)なら空配列', () => {
    expect(buildChannelSwitchDiagLines(makeInitialChannelSwitchDiag(), 1000)).toEqual([]);
    expect(buildChannelSwitchDiagLines(null, 1000)).toEqual([]);
  });

  it('観測ありなら2行を組み立てる', () => {
    const snap = {
      sentCount: 3,
      receivedCount: 3,
      rejectedCount: 1,
      lastSwitchToPaintMs: 40,
      avgSwitchToPaintMs: 55,
      lastEventAt: 9000
    };
    const lines = buildChannelSwitchDiagLines(snap, 10000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('送信3件');
    expect(lines[0]).toContain('受信3件');
    expect(lines[0]).toContain('破棄1');
    expect(lines[0]).toContain('最終1秒前');
    expect(lines[1]).toContain('直近40ms');
    expect(lines[1]).toContain('平均55ms');
  });

  it('未計測時は「未計測」を出す', () => {
    const snap = {
      sentCount: 1,
      receivedCount: 0,
      rejectedCount: 0,
      lastSwitchToPaintMs: -1,
      avgSwitchToPaintMs: -1,
      lastEventAt: 0
    };
    const lines = buildChannelSwitchDiagLines(snap, 1000);
    expect(lines[1]).toContain('未計測');
  });
});
