import { describe, expect, it } from 'vitest';
import {
  makeInitialBgmPhaseDiag,
  buildBgmPhaseDiagSnapshot,
  buildBgmPhaseDiagLines
} from './bgmPhaseDiag.js';

describe('makeInitialBgmPhaseDiag', () => {
  it('既定は通常フェーズ・BGM OFF・全カウンタ0', () => {
    const s = makeInitialBgmPhaseDiag();
    expect(s.phase).toBe('normal');
    expect(s.bgmEnabled).toBe(false);
    expect(s.reachInCount).toBe(0);
  });
});

describe('buildBgmPhaseDiagSnapshot', () => {
  it('欠損は初期値で埋める', () => {
    const snap = buildBgmPhaseDiagSnapshot(null, 1000);
    expect(snap.phase).toBe('normal');
    expect(snap.capturedAt).toBe(1000);
  });

  it('与えた値をそのまま反映する', () => {
    const snap = buildBgmPhaseDiagSnapshot(
      { phase: 'reach', r: 2.5, b: 3, reachInCount: 2, bgmEnabled: true, lastEventAt: 500 },
      1000
    );
    expect(snap.phase).toBe('reach');
    expect(snap.r).toBe(2.5);
    expect(snap.bgmEnabled).toBe(true);
    expect(snap.reachInCount).toBe(2);
  });
});

describe('buildBgmPhaseDiagLines', () => {
  it('未観測(lastEventAt=0)なら空配列(ノイズにしない)', () => {
    expect(buildBgmPhaseDiagLines(makeInitialBgmPhaseDiag(), Date.now())).toEqual([]);
  });

  it('観測済みなら現在フェーズ/R/B/in-out内訳を含む2行を返す', () => {
    const snap = buildBgmPhaseDiagSnapshot(
      { phase: 'reach', r: 2.6, b: 3.1, reachInCount: 1, feverInCount: 0, bgmEnabled: true, lastEventAt: 1000 },
      2000
    );
    const lines = buildBgmPhaseDiagLines(snap, 2000);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('リーチ');
    expect(lines[0]).toContain('R=2.60');
    expect(lines[1]).toContain('BGM設定=ON');
    expect(lines[1]).toContain('in:1');
  });

  it('null/undefinedは空配列', () => {
    expect(buildBgmPhaseDiagLines(null, Date.now())).toEqual([]);
    expect(buildBgmPhaseDiagLines(undefined, Date.now())).toEqual([]);
  });
});
