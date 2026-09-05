import { describe, expect, it } from 'vitest';
import {
  AVATAR_RETRY_SWEEP_MIN_GAP_MS,
  shouldSweepAvatarRetry
} from './avatarRetrySweepThrottle.js';

describe('shouldSweepAvatarRetry — アイコン再プローブ掃引の間引き', () => {
  const NOW = 1_700_000_000_000;

  it('min-gap は会場の diagDue と同じ 3 秒(面ごとに値をズラさない)', () => {
    expect(AVATAR_RETRY_SWEEP_MIN_GAP_MS).toBe(3000);
  });

  it('未実行(0)なら即実行してよい=初回の失敗を次の描画で拾える', () => {
    expect(shouldSweepAvatarRetry(0, NOW)).toBe(true);
    expect(shouldSweepAvatarRetry(null, NOW)).toBe(true);
    expect(shouldSweepAvatarRetry(undefined, NOW)).toBe(true);
  });

  it('★境界を固定する: min-gap ちょうどは通り、1ms 手前は通らない', () => {
    expect(shouldSweepAvatarRetry(NOW - 3000, NOW)).toBe(true);
    expect(shouldSweepAvatarRetry(NOW - 2999, NOW)).toBe(false);
  });

  it('間隔が足りなければ実行しない(hot path 保護)', () => {
    expect(shouldSweepAvatarRetry(NOW - 100, NOW)).toBe(false);
    expect(shouldSweepAvatarRetry(NOW, NOW)).toBe(false);
  });

  it('十分に経過していれば実行してよい', () => {
    expect(shouldSweepAvatarRetry(NOW - 60_000, NOW)).toBe(true);
  });

  it('★時計が巻き戻っても永久に掃引されない事故にならない', () => {
    // now < last(スリープ復帰・時刻同期などで実際に起こりうる)
    expect(shouldSweepAvatarRetry(NOW + 10_000, NOW)).toBe(true);
  });

  it('now が不正なら実行しない(壊れた時刻で暴走させない)', () => {
    expect(shouldSweepAvatarRetry(0, NaN)).toBe(false);
    expect(shouldSweepAvatarRetry(0, 0)).toBe(false);
    expect(shouldSweepAvatarRetry(0, -1)).toBe(false);
    expect(shouldSweepAvatarRetry(0, 'x')).toBe(false);
  });

  it('minGapMs を明示すればそれが優先される', () => {
    expect(shouldSweepAvatarRetry(NOW - 500, NOW, { minGapMs: 400 })).toBe(true);
    expect(shouldSweepAvatarRetry(NOW - 500, NOW, { minGapMs: 600 })).toBe(false);
    // 不正値は既定へ倒す(0 は「毎回実行」の意図なので尊重する)。
    expect(shouldSweepAvatarRetry(NOW - 100, NOW, { minGapMs: 0 })).toBe(true);
    expect(shouldSweepAvatarRetry(NOW - 100, NOW, { minGapMs: -5 })).toBe(false);
  });
});
