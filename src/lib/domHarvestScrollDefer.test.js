import { describe, it, expect } from 'vitest';
import {
  shouldDeferDomHarvestDuringScroll,
  shouldDeferVisibleScanDuringScroll
} from './domHarvestScrollDefer.js';

describe('shouldDeferDomHarvestDuringScroll', () => {
  it('直近スクロール（窓内）なら見送る', () => {
    expect(shouldDeferDomHarvestDuringScroll(1000, 900, 220)).toBe(true);
    expect(shouldDeferDomHarvestDuringScroll(1000, 1000, 220)).toBe(true);
  });

  it('窓を超えていれば見送らない', () => {
    expect(shouldDeferDomHarvestDuringScroll(1000, 700, 220)).toBe(false);
    expect(shouldDeferDomHarvestDuringScroll(2000, 1000, 220)).toBe(false);
  });

  it('境界（ちょうど窓）は見送らない（< 比較）', () => {
    expect(shouldDeferDomHarvestDuringScroll(1220, 1000, 220)).toBe(false);
    expect(shouldDeferDomHarvestDuringScroll(1219, 1000, 220)).toBe(true);
  });

  it('まだ一度もスクロールしていない（last<=0）なら見送らない', () => {
    expect(shouldDeferDomHarvestDuringScroll(1000, 0, 220)).toBe(false);
    expect(shouldDeferDomHarvestDuringScroll(1000, -5, 220)).toBe(false);
  });

  it('窓が 0 以下なら見送らない（機能無効化）', () => {
    expect(shouldDeferDomHarvestDuringScroll(1000, 990, 0)).toBe(false);
    expect(shouldDeferDomHarvestDuringScroll(1000, 990, -10)).toBe(false);
  });

  it('未来時刻（時計ずれで負の経過）は見送らない', () => {
    expect(shouldDeferDomHarvestDuringScroll(1000, 1200, 220)).toBe(false);
  });

  it('不正入力は見送らない（安全側）', () => {
    expect(shouldDeferDomHarvestDuringScroll(NaN, 900, 220)).toBe(false);
    expect(shouldDeferDomHarvestDuringScroll(1000, NaN, 220)).toBe(false);
    expect(shouldDeferDomHarvestDuringScroll(1000, 900, NaN)).toBe(false);
    expect(shouldDeferDomHarvestDuringScroll(undefined, 900, 220)).toBe(false);
  });
});

describe('shouldDeferVisibleScanDuringScroll', () => {
  it('スクロールバー由来の lastUserInitiated でも見送る', () => {
    expect(shouldDeferVisibleScanDuringScroll(1000, 0, 900, 220)).toBe(true);
  });
});
