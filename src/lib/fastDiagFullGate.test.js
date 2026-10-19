import { describe, expect, it } from 'vitest';
import { AI_SHARE_FAST_DIAG_FULL_MIN_INTERVAL_MS, shouldWriteFastDiagFull } from './fastDiagFullGate.js';

const T = 1_800_000_000_000;

describe('shouldWriteFastDiagFull', () => {
  it('★一度も書いていなければ書く', () => {
    expect(shouldWriteFastDiagFull({ now: T, lastFullAt: 0 })).toBe(true);
  });
  it('★前回から最小間隔(30秒)未満なら書かない・以上なら書く', () => {
    expect(shouldWriteFastDiagFull({ now: T + AI_SHARE_FAST_DIAG_FULL_MIN_INTERVAL_MS - 1, lastFullAt: T })).toBe(false);
    expect(shouldWriteFastDiagFull({ now: T + AI_SHARE_FAST_DIAG_FULL_MIN_INTERVAL_MS, lastFullAt: T })).toBe(true);
    expect(shouldWriteFastDiagFull({ now: T + 1500, lastFullAt: T })).toBe(false); // 従来の頻度(1.5秒)では書かない
  });
  it('★読み手が最新を求めたとき(forceFull)は、間隔に関係なく書く', () => {
    expect(shouldWriteFastDiagFull({ now: T + 10, lastFullAt: T, forceFull: true })).toBe(true);
  });
  it('★時計が戻った・値が壊れているときは書く(安全側=従来どおり)', () => {
    expect(shouldWriteFastDiagFull({ now: T - 5000, lastFullAt: T })).toBe(true);
    expect(shouldWriteFastDiagFull({ now: NaN, lastFullAt: T })).toBe(true);
    expect(shouldWriteFastDiagFull({ now: T, lastFullAt: NaN })).toBe(true);
    expect(shouldWriteFastDiagFull(null)).toBe(true);
  });
  it('最小間隔は、読み手の古さ判定(180秒)より十分短い', () => {
    expect(AI_SHARE_FAST_DIAG_FULL_MIN_INTERVAL_MS).toBeLessThan(180_000 / 2);
  });
});
