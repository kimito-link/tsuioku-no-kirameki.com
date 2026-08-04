import { describe, expect, it } from 'vitest';
import {
  LANE_SUPPLY_ORIGIN,
  createLaneSupplyOriginDiag,
  formatLaneSupplyOriginLine,
  noteLaneSupplyShrink,
  noteLaneSupplyWrite,
  snapshotLaneSupplyOriginDiag
} from './laneSupplyOriginDiag.js';

describe('laneSupplyOriginDiag', () => {
  it('供給元タグ別に暫定/確定を数える', () => {
    const d = createLaneSupplyOriginDiag();
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: false });
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: true });
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.LIGHT, provisional: true });
    const s = snapshotLaneSupplyOriginDiag(d);
    expect(s.byOrigin[LANE_SUPPLY_ORIGIN.HEAVY]).toEqual({ provTrue: 1, provFalse: 1, defaulted: 0 });
    expect(s.byOrigin[LANE_SUPPLY_ORIGIN.LIGHT]).toEqual({ provTrue: 1, provFalse: 0, defaulted: 0 });
  });

  it('★申告漏れ(provisional 未指定)を独立して数える', () => {
    const d = createLaneSupplyOriginDiag();
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.RESET_NO_WATCH, provisional: true, defaulted: true });
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: false });
    const s = snapshotLaneSupplyOriginDiag(d);
    expect(s.defaultedTotal).toBe(1);
    expect(s.byOrigin[LANE_SUPPLY_ORIGIN.RESET_NO_WATCH].defaulted).toBe(1);
    expect(s.line).toContain('申告漏れの疑い');
  });

  it('★現行犯記録: 縮小の直前に書いた供給元を名指しする', () => {
    const d = createLaneSupplyOriginDiag();
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: false });
    noteLaneSupplyShrink(d, { prevTiles: 33, nextTiles: 12 });
    const s = snapshotLaneSupplyOriginDiag(d);
    expect(s.shrinkCulprit).toEqual({
      origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: 0, prevTiles: 33, nextTiles: 12
    });
    expect(s.line).toContain('タイルが減った直前の供給元');
    expect(s.line).toContain('33枚→12枚');
    // 確定を名乗って縮小した=ガード素通りの直接原因なので、そう明言すること。
    expect(s.line).toContain('縮小ガードが素通り');
  });

  it('★ガードが守った(guardHit)ときは記録しない=画面は減っていない', () => {
    const d = createLaneSupplyOriginDiag();
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: true });
    noteLaneSupplyShrink(d, { prevTiles: 33, nextTiles: 12, guardHit: true });
    expect(snapshotLaneSupplyOriginDiag(d).shrinkCulprit).toBeNull();
    expect(snapshotLaneSupplyOriginDiag(d).shrinkObservedCount).toBe(0);
  });

  it('★増加・同数・前回0枚は縮小ではない(誤検知しない)', () => {
    const d = createLaneSupplyOriginDiag();
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: false });
    noteLaneSupplyShrink(d, { prevTiles: 10, nextTiles: 20 }); // 増加
    noteLaneSupplyShrink(d, { prevTiles: 10, nextTiles: 10 }); // 同数
    noteLaneSupplyShrink(d, { prevTiles: 0, nextTiles: 0 }); // 初回(守るものが無い)
    expect(snapshotLaneSupplyOriginDiag(d).shrinkObservedCount).toBe(0);
    noteLaneSupplyShrink(d, { prevTiles: 10, nextTiles: 9 }); // 1枚でも減れば記録
    expect(snapshotLaneSupplyOriginDiag(d).shrinkObservedCount).toBe(1);
  });

  it('暫定で縮小した場合は「素通り」と言わない(ガードは正しく働きうる)', () => {
    const d = createLaneSupplyOriginDiag();
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.LIGHT, provisional: true });
    noteLaneSupplyShrink(d, { prevTiles: 20, nextTiles: 5 });
    const line = formatLaneSupplyOriginLine(d);
    expect(line).toContain('暫定');
    expect(line).not.toContain('縮小ガードが素通り');
  });

  it('縮小が無ければ明示的に正常と出す(無言で黙らない)', () => {
    const d = createLaneSupplyOriginDiag();
    noteLaneSupplyWrite(d, { origin: LANE_SUPPLY_ORIGIN.HEAVY, provisional: false });
    expect(formatLaneSupplyOriginLine(d)).toContain('✅ タイルの縮小は観測されていません');
  });

  it('壊れた入力でも例外を投げない(計器は描画を止めない)', () => {
    expect(() => noteLaneSupplyWrite(null, { origin: 'x' })).not.toThrow();
    expect(() => noteLaneSupplyShrink(undefined, {})).not.toThrow();
    expect(snapshotLaneSupplyOriginDiag(null)).toBeNull();
    const d = createLaneSupplyOriginDiag();
    expect(() => noteLaneSupplyWrite(d, null)).not.toThrow();
    expect(snapshotLaneSupplyOriginDiag(d).byOrigin.unknown.provFalse).toBe(1);
  });
});
