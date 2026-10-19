import { describe, expect, it } from 'vitest';
import { STATUS_PUBLISHER_REFRESH_INTERVAL_MS, STATUS_REFRESH_INTERVAL_MS, statusRefreshIntervalMs } from './statusRefreshInterval.js';

describe('statusRefreshIntervalMs', () => {
  it('★人が見る通常の状態画面は従来どおり2秒', () => {
    expect(statusRefreshIntervalMs()).toBe(2000);
    expect(statusRefreshIntervalMs({})).toBe(2000);
    expect(statusRefreshIntervalMs({ publisher: false })).toBe(STATUS_REFRESH_INTERVAL_MS);
  });
  it('★見えない送信担当は10秒', () => {
    expect(statusRefreshIntervalMs({ publisher: true })).toBe(STATUS_PUBLISHER_REFRESH_INTERVAL_MS);
    expect(STATUS_PUBLISHER_REFRESH_INTERVAL_MS).toBe(10_000);
  });
  it('★送信担当の周期は、自動送信の間隔(120秒)と web_stale(180秒)に影響しない長さ(<=30秒)', () => {
    expect(STATUS_PUBLISHER_REFRESH_INTERVAL_MS).toBeLessThanOrEqual(30_000);
    expect(STATUS_PUBLISHER_REFRESH_INTERVAL_MS).toBeGreaterThan(STATUS_REFRESH_INTERVAL_MS);
  });
});
