import { describe, expect, it } from 'vitest';
import { summarizeOfficialCommentHistory } from './officialStatsWindow.js';

describe('summarizeOfficialCommentHistory', () => {
  it('履歴から comments delta / received delta / capture ratio を返す', () => {
    const r = summarizeOfficialCommentHistory({
      history: [
        { at: 0, statisticsComments: 100, recordedComments: 60 },
        { at: 30_000, statisticsComments: 120, recordedComments: 72 },
        { at: 60_000, statisticsComments: 150, recordedComments: 84 }
      ],
      nowMs: 60_000,
      targetWindowMs: 60_000,
      minWindowMs: 15_000
    });
    expect(r).toEqual({
      previousStatisticsComments: 100,
      currentStatisticsComments: 150,
      receivedCommentsDelta: 24,
      statisticsCommentsDelta: 50,
      captureRatio: 0.48,
      sampleWindowMs: 60_000
    });
  });

  it('target window に満たなくても最小窓を満たす最古サンプルを使う', () => {
    const r = summarizeOfficialCommentHistory({
      history: [
        { at: 0, statisticsComments: 100, recordedComments: 50 },
        { at: 20_000, statisticsComments: 120, recordedComments: 58 },
        { at: 40_000, statisticsComments: 130, recordedComments: 60 }
      ],
      nowMs: 40_000,
      targetWindowMs: 60_000,
      minWindowMs: 15_000
    });
    expect(r).toEqual({
      previousStatisticsComments: 100,
      currentStatisticsComments: 130,
      receivedCommentsDelta: 10,
      statisticsCommentsDelta: 30,
      captureRatio: 1 / 3,
      sampleWindowMs: 40_000
    });
  });

  it('有効な 2 点が無ければ null', () => {
    expect(
      summarizeOfficialCommentHistory({
        history: [{ at: 0, statisticsComments: 100, recordedComments: 50 }],
        nowMs: 0
      })
    ).toBeNull();
  });

  it('記録値や統計値が欠けたサンプルは無視する', () => {
    const r = summarizeOfficialCommentHistory({
      history: [
        { at: 0, statisticsComments: 100, recordedComments: 50 },
        { at: 20_000, statisticsComments: null, recordedComments: 58 },
        { at: 40_000, statisticsComments: 130, recordedComments: 60 }
      ],
      nowMs: 40_000,
      targetWindowMs: 40_000,
      minWindowMs: 15_000
    });
    expect(r).toEqual({
      previousStatisticsComments: 100,
      currentStatisticsComments: 130,
      receivedCommentsDelta: 10,
      statisticsCommentsDelta: 30,
      captureRatio: 1 / 3,
      sampleWindowMs: 40_000
    });
  });

  it('時刻順でなく投入されても同じ比較点を選ぶ', () => {
    const r = summarizeOfficialCommentHistory({
      history: [
        { at: 40_000, statisticsComments: 130, recordedComments: 60 },
        { at: 0, statisticsComments: 100, recordedComments: 50 },
        { at: 20_000, statisticsComments: 120, recordedComments: 55 }
      ],
      nowMs: 40_000,
      targetWindowMs: 60_000,
      minWindowMs: 15_000
    });
    expect(r).toEqual({
      previousStatisticsComments: 100,
      currentStatisticsComments: 130,
      receivedCommentsDelta: 10,
      statisticsCommentsDelta: 30,
      captureRatio: 1 / 3,
      sampleWindowMs: 40_000
    });
  });

  it('直近2点の間隔が minWindowMs 未満なら null（窓が取れない）', () => {
    expect(
      summarizeOfficialCommentHistory({
        history: [
          { at: 0, statisticsComments: 100, recordedComments: 50 },
          { at: 10_000, statisticsComments: 110, recordedComments: 55 }
        ],
        nowMs: 10_000,
        targetWindowMs: 60_000,
        minWindowMs: 15_000
      })
    ).toBeNull();
  });

  it('記録ON直後のように recorded が低い古い点から、統計だけ進んだ現在点まで比較できる', () => {
    const r = summarizeOfficialCommentHistory({
      history: [
        { at: 0, statisticsComments: 10_000, recordedComments: 0 },
        { at: 30_000, statisticsComments: 10_050, recordedComments: 40 },
        { at: 90_000, statisticsComments: 10_200, recordedComments: 95 }
      ],
      nowMs: 90_000,
      targetWindowMs: 60_000,
      minWindowMs: 15_000
    });
    expect(r).not.toBeNull();
    expect(r?.previousStatisticsComments).toBe(10_050);
    expect(r?.currentStatisticsComments).toBe(10_200);
    expect(r?.receivedCommentsDelta).toBe(55);
    expect(r?.statisticsCommentsDelta).toBe(150);
  });

  it('未来時刻のサンプルは now より後なら捨てる', () => {
    const r = summarizeOfficialCommentHistory({
      history: [
        { at: 0, statisticsComments: 100, recordedComments: 50 },
        { at: 50_000, statisticsComments: 120, recordedComments: 60 },
        { at: 200_000, statisticsComments: 999, recordedComments: 999 }
      ],
      nowMs: 60_000,
      targetWindowMs: 60_000,
      minWindowMs: 15_000
    });
    expect(r).toEqual({
      previousStatisticsComments: 100,
      currentStatisticsComments: 120,
      receivedCommentsDelta: 10,
      statisticsCommentsDelta: 20,
      captureRatio: 0.5,
      sampleWindowMs: 50_000
    });
  });
});
