import { describe, it, expect } from 'vitest';
import {
  shouldSkipDeepHarvest,
  shouldForceDeepHarvestForReason,
  shouldForceDeepHarvestRecovery
} from './shouldSkipDeepHarvest.js';
import { DEEP_HARVEST_REASONS } from './deepHarvestReason.js';

describe('shouldSkipDeepHarvest', () => {
  const T = 1_000_000;

  it('NDGR が最近アクティブなら true を返す', () => {
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: T - 10_000, now: T, thresholdMs: 60_000 })
    ).toBe(true);
  });

  it('NDGR が閾値ちょうどなら false（境界）', () => {
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: T - 60_000, now: T, thresholdMs: 60_000 })
    ).toBe(false);
  });

  it('NDGR が閾値より古いなら false', () => {
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: T - 120_000, now: T, thresholdMs: 60_000 })
    ).toBe(false);
  });

  it('ndgrLastReceivedAt が 0 なら false（初回起動時）', () => {
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: 0, now: T, thresholdMs: 60_000 })
    ).toBe(false);
  });

  it('ndgrLastReceivedAt が null/undefined なら false', () => {
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: null, now: T, thresholdMs: 60_000 })
    ).toBe(false);
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: undefined, now: T, thresholdMs: 60_000 })
    ).toBe(false);
  });

  it('thresholdMs 省略時はデフォルト 60_000 で判定', () => {
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: T - 30_000, now: T })
    ).toBe(true);
    expect(
      shouldSkipDeepHarvest({ ndgrLastReceivedAt: T - 90_000, now: T })
    ).toBe(false);
  });
});

describe('shouldForceDeepHarvestForReason', () => {
  it('startup は強制実行する', () => {
    expect(shouldForceDeepHarvestForReason(DEEP_HARVEST_REASONS.startup)).toBe(true);
  });

  it('recording-on は強制しない', () => {
    expect(shouldForceDeepHarvestForReason(DEEP_HARVEST_REASONS.recordingOn)).toBe(false);
  });

  it('live-id-change は強制しない', () => {
    expect(shouldForceDeepHarvestForReason(DEEP_HARVEST_REASONS.liveIdChange)).toBe(false);
  });

  it('tab-visible は強制しない', () => {
    expect(shouldForceDeepHarvestForReason(DEEP_HARVEST_REASONS.tabVisible)).toBe(false);
  });

  it('不明な理由は強制しない', () => {
    expect(shouldForceDeepHarvestForReason('unknown')).toBe(false);
  });
});

describe('shouldForceDeepHarvestRecovery', () => {
  const T = 10_000_000;
  const RECOVERY = 240_000;

  it('lastCompletedAt が 0（未実行）なら true', () => {
    expect(
      shouldForceDeepHarvestRecovery({ lastCompletedAt: 0, now: T, recoveryMs: RECOVERY })
    ).toBe(true);
  });

  it('recovery 時間を超えていたら true', () => {
    expect(
      shouldForceDeepHarvestRecovery({
        lastCompletedAt: T - RECOVERY - 1,
        now: T,
        recoveryMs: RECOVERY
      })
    ).toBe(true);
  });

  it('recovery 時間ちょうどなら false（境界: まだ猶予内）', () => {
    expect(
      shouldForceDeepHarvestRecovery({
        lastCompletedAt: T - RECOVERY,
        now: T,
        recoveryMs: RECOVERY
      })
    ).toBe(false);
  });

  it('recovery 時間未満なら false', () => {
    expect(
      shouldForceDeepHarvestRecovery({
        lastCompletedAt: T - 60_000,
        now: T,
        recoveryMs: RECOVERY
      })
    ).toBe(false);
  });

  it('lastCompletedAt が null/undefined なら true（未実行扱い）', () => {
    expect(
      shouldForceDeepHarvestRecovery({ lastCompletedAt: null, now: T, recoveryMs: RECOVERY })
    ).toBe(true);
    expect(
      shouldForceDeepHarvestRecovery({ lastCompletedAt: undefined, now: T, recoveryMs: RECOVERY })
    ).toBe(true);
  });

  it('recoveryMs 省略時はデフォルト 240_000 で判定', () => {
    expect(
      shouldForceDeepHarvestRecovery({ lastCompletedAt: T - 200_000, now: T })
    ).toBe(false);
    expect(
      shouldForceDeepHarvestRecovery({ lastCompletedAt: T - 400_000, now: T })
    ).toBe(true);
  });
});
