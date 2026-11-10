import { describe, expect, it } from 'vitest';
import {
  LANE_PROGRESSIVE_MIN_ITEMS,
  LANE_PROGRESSIVE_NEW_PER_PASS,
  mayBuildNewLaneTileNow,
  shouldFillLaneProgressively
} from './laneProgressiveFill.js';

describe('laneProgressiveFill', () => {
  it('ふつうの大きさの段は1回で作る', () => {
    expect(shouldFillLaneProgressively({ itemCount: LANE_PROGRESSIVE_MIN_ITEMS - 1, hasWrap: false, canSchedule: true })).toBe(false);
  });
  it('大きな段は分けて足す', () => {
    expect(shouldFillLaneProgressively({ itemCount: 2000, hasWrap: false, canSchedule: true })).toBe(true);
  });
  it('会場(席に包む)・予約できない所では分けない', () => {
    expect(shouldFillLaneProgressively({ itemCount: 2000, hasWrap: true, canSchedule: true })).toBe(false);
    expect(shouldFillLaneProgressively({ itemCount: 2000, hasWrap: false, canSchedule: false })).toBe(false);
  });
  it('1回に新しく作る数を超えたら次の回へ回す', () => {
    expect(mayBuildNewLaneTileNow({ progressive: true, newBuiltSoFar: LANE_PROGRESSIVE_NEW_PER_PASS - 1 })).toBe(true);
    expect(mayBuildNewLaneTileNow({ progressive: true, newBuiltSoFar: LANE_PROGRESSIVE_NEW_PER_PASS })).toBe(false);
    expect(mayBuildNewLaneTileNow({ progressive: false, newBuiltSoFar: 99999 })).toBe(true);
  });
});
