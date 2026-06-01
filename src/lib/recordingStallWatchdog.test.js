import { describe, it, expect } from 'vitest';
import {
  evaluateRecordingStall,
  pickStallRecoveryActions,
  RECORDING_STALL_GRACE_MS
} from './recordingStallWatchdog.js';

describe('evaluateRecordingStall', () => {
  const base = {
    recording: true,
    officialCount: 1000,
    recordedCount: 400,
    lastRecordedGrowthAtMs: 0,
    lastOfficialGrowthAtMs: 100_000,
    nowMs: 100_000
  };

  it('録画中でなければ停止扱いしない', () => {
    const r = evaluateRecordingStall({ ...base, recording: false });
    expect(r.stalled).toBe(false);
    expect(r.reason).toBe('not_recording');
  });

  it('公式コメ数が無い/0 のときは判定不能（停止扱いしない）', () => {
    expect(evaluateRecordingStall({ ...base, officialCount: null }).reason).toBe(
      'no_official'
    );
    expect(evaluateRecordingStall({ ...base, officialCount: 0 }).reason).toBe(
      'no_official'
    );
    expect(
      evaluateRecordingStall({ ...base, officialCount: Number.NaN }).reason
    ).toBe('no_official');
  });

  it('公式とほぼ同数（gap<=minGap）なら追いついている＝停止扱いしない', () => {
    const r = evaluateRecordingStall({
      ...base,
      officialCount: 402,
      recordedCount: 400
    });
    expect(r.stalled).toBe(false);
    expect(r.reason).toBe('caught_up');
  });

  it('公式が一定時間伸びていない（番組停止/終了）なら停止扱いしない', () => {
    const r = evaluateRecordingStall({
      ...base,
      lastOfficialGrowthAtMs: 0,
      nowMs: 200_000 // 公式は 200s 前から伸びていない
    });
    expect(r.stalled).toBe(false);
    expect(r.reason).toBe('official_idle');
  });

  it('記録が直近に伸びていれば停止扱いしない', () => {
    const r = evaluateRecordingStall({
      ...base,
      lastRecordedGrowthAtMs: 100_000 - 5_000, // 5s 前に伸びた
      nowMs: 100_000
    });
    expect(r.stalled).toBe(false);
    expect(r.reason).toBe('recently_grew');
  });

  it('公式は前進・記録は猶予超で停止＝停止と判定する', () => {
    const r = evaluateRecordingStall({
      ...base,
      lastRecordedGrowthAtMs: 100_000 - (RECORDING_STALL_GRACE_MS + 1_000),
      lastOfficialGrowthAtMs: 100_000 - 1_000,
      nowMs: 100_000
    });
    expect(r.stalled).toBe(true);
    expect(r.reason).toBe('recorded_flat_while_official_advancing');
  });

  it('猶予のちょうど境界（grace 丁度）は未満ではないので停止', () => {
    const r = evaluateRecordingStall({
      ...base,
      lastRecordedGrowthAtMs: 100_000 - RECORDING_STALL_GRACE_MS,
      lastOfficialGrowthAtMs: 100_000 - 1_000,
      nowMs: 100_000
    });
    expect(r.stalled).toBe(true);
  });
});

describe('pickStallRecoveryActions', () => {
  it('1回目は flush のみ（最も軽い手）', () => {
    expect(pickStallRecoveryActions(1)).toEqual({
      flush: true,
      reseed: false,
      forwardCrawl: false
    });
  });

  it('2回目は flush + reseed（移行リトライ含む）', () => {
    expect(pickStallRecoveryActions(2)).toEqual({
      flush: true,
      reseed: true,
      forwardCrawl: false
    });
  });

  it('3回目以降は forwardCrawl まで含めて総動員', () => {
    expect(pickStallRecoveryActions(3)).toEqual({
      flush: true,
      reseed: true,
      forwardCrawl: true
    });
    expect(pickStallRecoveryActions(9)).toEqual({
      flush: true,
      reseed: true,
      forwardCrawl: true
    });
  });

  it('不正な試行回数でも最低 1 回目として扱う', () => {
    expect(pickStallRecoveryActions(0)).toEqual({
      flush: true,
      reseed: false,
      forwardCrawl: false
    });
    expect(pickStallRecoveryActions(-5)).toEqual({
      flush: true,
      reseed: false,
      forwardCrawl: false
    });
    expect(pickStallRecoveryActions(Number.NaN)).toEqual({
      flush: true,
      reseed: false,
      forwardCrawl: false
    });
  });
});
