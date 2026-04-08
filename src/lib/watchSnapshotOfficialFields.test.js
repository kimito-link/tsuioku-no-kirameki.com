import { describe, expect, it } from 'vitest';
import { buildWatchSnapshotOfficialFields } from './watchSnapshotOfficialFields.js';

describe('buildWatchSnapshotOfficialFields', () => {
  it('数値が無効・負のときは null に正規化する', () => {
    const base = {
      nowMs: 1_000_000,
      officialStatsUpdatedAt: 0,
      officialViewerIntervalMs: null,
      officialCommentSummary: null
    };
    expect(
      buildWatchSnapshotOfficialFields({
        ...base,
        officialViewerCount: NaN,
        officialCommentCount: -1
      })
    ).toMatchObject({
      officialViewerCount: null,
      officialCommentCount: null,
      officialStatsUpdatedAt: null,
      officialStatsFreshnessMs: null,
      officialCommentStatsUpdatedAt: null,
      officialCommentStatsFreshnessMs: null
    });
  });

  it('有効な公式値と freshness を返す', () => {
    expect(
      buildWatchSnapshotOfficialFields({
        nowMs: 100_000,
        officialViewerCount: 42,
        officialCommentCount: 10,
        officialStatsUpdatedAt: 90_000,
        officialViewerIntervalMs: 30_000,
        officialCommentSummary: null
      })
    ).toEqual({
      officialViewerCount: 42,
      officialCommentCount: 10,
      officialStatsUpdatedAt: 90_000,
      officialStatsFreshnessMs: 10_000,
      officialCommentStatsUpdatedAt: null,
      officialCommentStatsFreshnessMs: null,
      officialViewerIntervalMs: 30_000,
      officialStatisticsCommentsDelta: null,
      officialReceivedCommentsDelta: null,
      officialCommentSampleWindowMs: null,
      officialCaptureRatio: null
    });
  });

  it('公式コメント数の最終更新時刻と鮮度を返す', () => {
    expect(
      buildWatchSnapshotOfficialFields({
        nowMs: 200_000,
        officialViewerCount: null,
        officialCommentCount: 99,
        officialStatsUpdatedAt: 0,
        officialCommentStatsUpdatedAt: 170_000,
        officialViewerIntervalMs: null,
        officialCommentSummary: null
      })
    ).toMatchObject({
      officialCommentCount: 99,
      officialCommentStatsUpdatedAt: 170_000,
      officialCommentStatsFreshnessMs: 30_000,
      officialStatsUpdatedAt: null,
      officialStatsFreshnessMs: null
    });
  });

  it('officialCommentSummary からデルタと captureRatio を写す', () => {
    expect(
      buildWatchSnapshotOfficialFields({
        nowMs: 0,
        officialViewerCount: null,
        officialCommentCount: null,
        officialStatsUpdatedAt: 0,
        officialViewerIntervalMs: 0,
        officialCommentSummary: {
          statisticsCommentsDelta: 5,
          receivedCommentsDelta: 3,
          sampleWindowMs: 60_000,
          captureRatio: 0.75
        }
      })
    ).toMatchObject({
      officialStatisticsCommentsDelta: 5,
      officialReceivedCommentsDelta: 3,
      officialCommentSampleWindowMs: 60_000,
      officialCaptureRatio: 0.75
    });
  });

  it('0 のデルタは null 落ちしない', () => {
    expect(
      buildWatchSnapshotOfficialFields({
        nowMs: 0,
        officialViewerCount: null,
        officialCommentCount: null,
        officialStatsUpdatedAt: 0,
        officialViewerIntervalMs: null,
        officialCommentSummary: {
          statisticsCommentsDelta: 0,
          receivedCommentsDelta: 0,
          sampleWindowMs: 0,
          captureRatio: 0
        }
      })
    ).toMatchObject({
      officialStatisticsCommentsDelta: 0,
      officialReceivedCommentsDelta: 0,
      officialCommentSampleWindowMs: 0,
      officialCaptureRatio: 0
    });
  });
});
