import { describe, it, expect } from 'vitest';
import { shouldRetryRankingAcquisitionOnVisible } from './rankingVisibleRetryDecision.js';

const base = {
  laneEnabled: true,
  recording: true,
  hasLiveId: true,
  locationAllowed: true,
  visible: true,
  haveRanking: false,
  nowMs: 100_000,
  lastRetryAtMs: 0,
  minIntervalMs: 60_000,
  lastAutoOpenStatus: ''
};

describe('shouldRetryRankingAcquisitionOnVisible', () => {
  it('全条件を満たすと再試行する', () => {
    expect(shouldRetryRankingAcquisitionOnVisible(base)).toBe(true);
  });

  it('lane 無効なら false', () => {
    expect(shouldRetryRankingAcquisitionOnVisible({ ...base, laneEnabled: false })).toBe(false);
  });

  it('記録 OFF なら false', () => {
    expect(shouldRetryRankingAcquisitionOnVisible({ ...base, recording: false })).toBe(false);
  });

  it('liveId 無しなら false', () => {
    expect(shouldRetryRankingAcquisitionOnVisible({ ...base, hasLiveId: false })).toBe(false);
  });

  it('非許可ロケーションなら false', () => {
    expect(shouldRetryRankingAcquisitionOnVisible({ ...base, locationAllowed: false })).toBe(false);
  });

  it('非可視なら false（裏タブでは再試行しない）', () => {
    expect(shouldRetryRankingAcquisitionOnVisible({ ...base, visible: false })).toBe(false);
  });

  it('既にランキング取得済みなら false', () => {
    expect(shouldRetryRankingAcquisitionOnVisible({ ...base, haveRanking: true })).toBe(false);
  });

  it('冷却時間内なら false', () => {
    expect(
      shouldRetryRankingAcquisitionOnVisible({ ...base, nowMs: 50_000, lastRetryAtMs: 10_000 })
    ).toBe(false); // 40s < 60s
  });

  it('冷却時間を超えていれば true', () => {
    expect(
      shouldRetryRankingAcquisitionOnVisible({ ...base, nowMs: 80_000, lastRetryAtMs: 10_000 })
    ).toBe(true); // 70s >= 60s
  });

  it('rescue-link 状態(opened-but-no-banner)なら false', () => {
    expect(
      shouldRetryRankingAcquisitionOnVisible({ ...base, lastAutoOpenStatus: 'opened-but-no-banner' })
    ).toBe(false);
  });

  it('rescue-link 状態(opened-no-banner-no-ranking*)なら false', () => {
    expect(
      shouldRetryRankingAcquisitionOnVisible({
        ...base,
        lastAutoOpenStatus: 'opened-no-banner-no-ranking-xyz'
      })
    ).toBe(false);
  });

  it('入力欠落でも例外を投げず false', () => {
    expect(shouldRetryRankingAcquisitionOnVisible(null)).toBe(false);
    expect(shouldRetryRankingAcquisitionOnVisible({})).toBe(false);
  });
});
