import { describe, it, expect } from 'vitest';
import {
  computeRefreshBackoffTicks,
  REFRESH_INTERVAL_MS,
  REFRESH_SLOW_MS,
  REFRESH_BACKOFF_TICKS_MAX
} from './statusRefreshBackoff.js';

describe('computeRefreshBackoffTicks（v0.1.1010: 所要比例の間引き）', () => {
  it('通常時(REFRESH_SLOW_MS 以下)は 0=間引かない', () => {
    expect(computeRefreshBackoffTicks(5)).toBe(0);
    expect(computeRefreshBackoffTicks(REFRESH_SLOW_MS)).toBe(0);
    expect(computeRefreshBackoffTicks(0)).toBe(0);
  });

  it('重いほど大きく間引く(所要/基準間隔の切り上げ)', () => {
    // 1819ms → ceil(1819/2000)=1tick
    expect(computeRefreshBackoffTicks(1819)).toBe(1);
    // 4000ms → 2tick
    expect(computeRefreshBackoffTicks(4000)).toBe(2);
    // 実機 7071ms → ceil(7071/2000)=4tick(=約8秒控える)
    expect(computeRefreshBackoffTicks(7071)).toBe(4);
  });

  it('上限(REFRESH_BACKOFF_TICKS_MAX)でクランプ(激重でも天井)', () => {
    expect(computeRefreshBackoffTicks(999999)).toBe(REFRESH_BACKOFF_TICKS_MAX);
  });

  it('v0.1.1062実機ケース: 62秒かかる更新は62秒休む(旧天井30秒では読みっぱなしだった)', () => {
    // 62026ms → ceil(62026/2000)=32tick=64秒休み ≒ 占有率50%以下
    expect(computeRefreshBackoffTicks(62026)).toBe(32);
  });

  it('SLOW 直後(501ms 等)は最低1tick', () => {
    expect(computeRefreshBackoffTicks(REFRESH_SLOW_MS + 1)).toBe(1);
  });

  it('非数/負は 0(後方互換・暴走しない)', () => {
    expect(computeRefreshBackoffTicks(NaN)).toBe(0);
    expect(computeRefreshBackoffTicks(undefined)).toBe(0);
    expect(computeRefreshBackoffTicks(null)).toBe(0);
    expect(computeRefreshBackoffTicks(-100)).toBe(0);
  });

  it('しきい値を opts で上書きできる(テスト/将来調整用)', () => {
    expect(computeRefreshBackoffTicks(3000, { intervalMs: 1000, slowMs: 100, maxTicks: 5 })).toBe(3);
    expect(computeRefreshBackoffTicks(50, { slowMs: 100 })).toBe(0);
  });

  it('基準間隔・しきい値・上限の既定が想定値', () => {
    expect(REFRESH_INTERVAL_MS).toBe(2000);
    expect(REFRESH_SLOW_MS).toBe(500);
    expect(REFRESH_BACKOFF_TICKS_MAX).toBe(60);
  });
});
