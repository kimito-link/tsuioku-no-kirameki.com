import { describe, it, expect } from 'vitest';
import {
  shouldActivateForwardForDeadEntry,
  FORWARD_REACTIVATION_STALE_MS
} from './forwardReactivation.js';

describe('shouldActivateForwardForDeadEntry (v0.1.765 入口が死んだ時だけforward起動)', () => {
  // 実機 fastDiag(lv350762947)の死の署名: ndgrLastReceivedAgo 11分・seg:0 rows:0
  //   backward_exhausted・記録414/公式1302(=32%)・forward 未走行。
  const dead = {
    ndgrLastReceivedAgoMs: 689_201,
    staleThresholdMs: FORWARD_REACTIVATION_STALE_MS,
    backfillStopReason: 'backward_exhausted',
    backfillSegThisRun: 0,
    backfillRowsThisRun: 0,
    recordedCount: 414,
    officialCount: 1302,
    forwardAlreadyRunning: false
  };

  it('🔴実機の死の署名(受信11分前+seg0/rows0 backward_exhausted+ギャップ大)→forward起動', () => {
    expect(shouldActivateForwardForDeadEntry(dead)).toBe(true);
  });

  it('no_entry / no_view_base も死の署名として扱う', () => {
    expect(shouldActivateForwardForDeadEntry({ ...dead, backfillStopReason: 'no_entry' })).toBe(true);
    expect(shouldActivateForwardForDeadEntry({ ...dead, backfillStopReason: 'no_view_base' })).toBe(true);
  });

  it('NDGR を新鮮に受信できている(しきい未満)=入口は生きている→起動しない', () => {
    expect(shouldActivateForwardForDeadEntry({ ...dead, ndgrLastReceivedAgoMs: 30_000 })).toBe(false);
  });

  it('rows>0 で遡れた末の backward_exhausted=本当に遡り切った→起動しない', () => {
    expect(shouldActivateForwardForDeadEntry({ ...dead, backfillRowsThisRun: 120 })).toBe(false);
  });

  it('seg>0(1区画でも辿れた)=入口は生きていた→起動しない', () => {
    expect(shouldActivateForwardForDeadEntry({ ...dead, backfillSegThisRun: 3 })).toBe(false);
  });

  it('実質達成(記録>=公式95%)=取り切っている→起動しない(無駄打ち防止)', () => {
    expect(
      shouldActivateForwardForDeadEntry({ ...dead, recordedCount: 1250, officialCount: 1302 })
    ).toBe(false);
  });

  it('forward が既に走っている=入口を維持中→再起動しない', () => {
    expect(shouldActivateForwardForDeadEntry({ ...dead, forwardAlreadyRunning: true })).toBe(false);
  });

  it('死でない stopReason(rate_limited/cap_elapsed/reached_start)→起動しない(別経路が担当)', () => {
    for (const reason of ['rate_limited', 'cap_elapsed', 'reached_start', 'aborted', '']) {
      expect(
        shouldActivateForwardForDeadEntry({ ...dead, backfillStopReason: reason }),
        `reason=${reason}`
      ).toBe(false);
    }
  });

  it('公式不明/0 or 引数欠落→起動しない(fail-safe)', () => {
    expect(shouldActivateForwardForDeadEntry({ ...dead, officialCount: 0 })).toBe(false);
    expect(shouldActivateForwardForDeadEntry({ ...dead, officialCount: null })).toBe(false);
    expect(shouldActivateForwardForDeadEntry({})).toBe(false);
    expect(shouldActivateForwardForDeadEntry(undefined)).toBe(false);
  });
});
