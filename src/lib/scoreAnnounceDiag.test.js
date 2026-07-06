import { describe, it, expect } from 'vitest';
import {
  makeInitialScoreAnnounceDiag,
  buildScoreAnnounceDiagSnapshot,
  buildScoreAnnounceDiagLines
} from './scoreAnnounceDiag.js';

describe('makeInitialScoreAnnounceDiag', () => {
  it('全カウンタが0/空で始まる', () => {
    const init = makeInitialScoreAnnounceDiag();
    expect(init.startedCount).toBe(0);
    expect(init.completedCount).toBe(0);
    expect(init.abortedCount).toBe(0);
    expect(init.lastAbortReason).toBe('');
    expect(init.lastLiveId).toBe('');
    expect(init.lastRank).toBe('');
    expect(init.lastEventAt).toBe(0);
  });
});

describe('buildScoreAnnounceDiagSnapshot', () => {
  it('欠損は初期値で埋める', () => {
    const snap = buildScoreAnnounceDiagSnapshot(null, 1000);
    expect(snap.startedCount).toBe(0);
    expect(snap.capturedAt).toBe(1000);
  });

  it('値があればそのまま反映する', () => {
    const snap = buildScoreAnnounceDiagSnapshot(
      {
        startedCount: 3,
        autoStartedCount: 1,
        manualStartedCount: 2,
        completedCount: 2,
        abortedCount: 1,
        lastAbortReason: 'already_running',
        lastLiveId: 'lv1',
        lastRank: 'S',
        lastEventAt: 500
      },
      1000
    );
    expect(snap).toMatchObject({
      startedCount: 3,
      autoStartedCount: 1,
      manualStartedCount: 2,
      completedCount: 2,
      abortedCount: 1,
      lastAbortReason: 'already_running',
      lastLiveId: 'lv1',
      lastRank: 'S',
      lastEventAt: 500,
      capturedAt: 1000
    });
  });

  it('非数値のカウンタは初期値にフォールバック', () => {
    const snap = buildScoreAnnounceDiagSnapshot({ startedCount: 'x' }, 1000);
    expect(snap.startedCount).toBe(0);
  });
});

describe('buildScoreAnnounceDiagLines', () => {
  it('未観測(startedCount=0)なら空配列', () => {
    expect(buildScoreAnnounceDiagLines(makeInitialScoreAnnounceDiag(), 1000)).toEqual([]);
  });

  it('null/undefinedは空配列', () => {
    expect(buildScoreAnnounceDiagLines(null, 1000)).toEqual([]);
    expect(buildScoreAnnounceDiagLines(undefined, 1000)).toEqual([]);
  });

  it('観測ありなら2行(起動内訳+完走/中断内訳)', () => {
    const snap = buildScoreAnnounceDiagSnapshot(
      {
        startedCount: 2,
        autoStartedCount: 1,
        manualStartedCount: 1,
        completedCount: 1,
        abortedCount: 1,
        lastAbortReason: 'already_running',
        lastLiveId: 'lv1',
        lastRank: 'A',
        lastEventAt: 900
      },
      1000
    );
    const lines = buildScoreAnnounceDiagLines(snap, 1000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('起動2');
    expect(lines[0]).toContain('自動1');
    expect(lines[0]).toContain('手動1');
    expect(lines[0]).toContain('ランクA');
    expect(lines[1]).toContain('完走1');
    expect(lines[1]).toContain('中断1');
    expect(lines[1]).toContain('already_running');
  });

  it('中断0件のときは中断理由を出さない', () => {
    const snap = buildScoreAnnounceDiagSnapshot(
      { startedCount: 1, autoStartedCount: 1, completedCount: 1, abortedCount: 0, lastEventAt: 900 },
      1000
    );
    const lines = buildScoreAnnounceDiagLines(snap, 1000);
    expect(lines[1]).not.toContain('中断理由');
  });
});
