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

  it('v0.1.1098追加: 採点用フェーズ実績カウンタも既定0・liveId空(BGMトグル非依存・§SC1)', () => {
    const s = makeInitialBgmPhaseDiag();
    expect(s.liveId).toBe('');
    expect(s.reachCount).toBe(0);
    expect(s.breakthroughCount).toBe(0);
    expect(s.jackpotCount).toBe(0);
    expect(s.rMax).toBe(0);
    expect(s.hotDwellMs).toBe(0);
    expect(s.elapsedMs).toBe(0);
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

  it('v0.1.1098追加: 採点用フィールド(additive拡張)を欠損なく反映・欠損は初期値で埋める', () => {
    const snap = buildBgmPhaseDiagSnapshot(
      {
        liveId: 'lv12345',
        reachCount: 3,
        breakthroughCount: 1,
        jackpotCount: 1,
        rMax: 6.2,
        hotDwellMs: 42_000,
        elapsedMs: 300_000
      },
      2000
    );
    expect(snap.liveId).toBe('lv12345');
    expect(snap.reachCount).toBe(3);
    expect(snap.breakthroughCount).toBe(1);
    expect(snap.jackpotCount).toBe(1);
    expect(snap.rMax).toBe(6.2);
    expect(snap.hotDwellMs).toBe(42_000);
    expect(snap.elapsedMs).toBe(300_000);
  });

  it('v0.1.1098追加: 既存フィールドのみ渡した旧形式でも採点用フィールドは初期値で埋まる(後方互換)', () => {
    const snap = buildBgmPhaseDiagSnapshot({ phase: 'reach', reachInCount: 2 }, 1000);
    expect(snap.liveId).toBe('');
    expect(snap.reachCount).toBe(0);
    expect(snap.breakthroughCount).toBe(0);
    expect(snap.jackpotCount).toBe(0);
    expect(snap.rMax).toBe(0);
    expect(snap.hotDwellMs).toBe(0);
    expect(snap.elapsedMs).toBe(0);
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
