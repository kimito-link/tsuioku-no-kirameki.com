import { describe, expect, it } from 'vitest';
import { STATUS_PUBLISHER_REFRESH_INTERVAL_MS, STATUS_REFRESH_INTERVAL_MS, shouldRunPublisherTick, statusRefreshIntervalMs } from './statusRefreshInterval.js';

describe('statusRefreshIntervalMs', () => {
  it('★人が見る通常の状態画面は従来どおり2秒', () => {
    expect(statusRefreshIntervalMs()).toBe(2000);
    expect(statusRefreshIntervalMs({})).toBe(2000);
    expect(statusRefreshIntervalMs({ publisher: false })).toBe(STATUS_REFRESH_INTERVAL_MS);
  });
  it('★見えない送信担当は5秒周期(v0.1.1736)', () => {
    expect(statusRefreshIntervalMs({ publisher: true })).toBe(STATUS_PUBLISHER_REFRESH_INTERVAL_MS);
    expect(STATUS_PUBLISHER_REFRESH_INTERVAL_MS).toBe(5_000);
  });
  it('★スマホが開いている間だけ毎回(5秒)描き直す。開いていなければ2回に1回(10秒=今までと同じ重さ)', () => {
    expect([0, 1, 2, 3].map((tickNo) => shouldRunPublisherTick({ tickNo, viewerActive: true }))).toEqual([true, true, true, true]);
    expect([0, 1, 2, 3].map((tickNo) => shouldRunPublisherTick({ tickNo, viewerActive: false }))).toEqual([true, false, true, false]);
  });
  it('★送信担当の周期は、自動送信の間隔(120秒)と web_stale(180秒)に影響しない長さ(<=30秒)', () => {
    expect(STATUS_PUBLISHER_REFRESH_INTERVAL_MS).toBeLessThanOrEqual(30_000);
    expect(STATUS_PUBLISHER_REFRESH_INTERVAL_MS).toBeGreaterThan(STATUS_REFRESH_INTERVAL_MS);
  });
});
