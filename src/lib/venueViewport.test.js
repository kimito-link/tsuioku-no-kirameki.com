import { describe, it, expect } from 'vitest';
import {
  seatsPerRow,
  resolveVisibleArenaCount,
  resolveDynamicArenaCap,
  resolveVenueMaxHeightVh,
  resolveVisibleAudienceCount,
  selectStableVisibleMembers
} from './venueViewport.js';

describe('seatsPerRow', () => {
  it('幅÷席幅の整数(>=1)', () => {
    expect(seatsPerRow(1000, 100)).toBe(10);
    expect(seatsPerRow(950, 100)).toBe(9);
  });
  it('幅0や席幅0でも最低1', () => {
    expect(seatsPerRow(0, 100)).toBe(1);
    expect(seatsPerRow(500, 0)).toBe(500);
    expect(seatsPerRow(50, 100)).toBe(1);
  });
});

describe('resolveVisibleArenaCount', () => {
  it('列数×段数とhardCapと論理人数の最小をとる', () => {
    // perRow=10, rows=3 => 30, total=100, cap=40 => 30
    expect(resolveVisibleArenaCount({ totalCount: 100, perRow: 10, rows: 3, hardCap: 40 })).toBe(30);
    // perRow=20, rows=3 => 60 だが hardCap=40 => 40
    expect(resolveVisibleArenaCount({ totalCount: 100, perRow: 20, rows: 3, hardCap: 40 })).toBe(40);
    // total が少なければ total
    expect(resolveVisibleArenaCount({ totalCount: 12, perRow: 10, rows: 3, hardCap: 40 })).toBe(12);
  });
  it('横はみ出しを防ぐ: perRow を超える列にはしない', () => {
    // perRow=8 段3 => 24 が上限(150席あっても24しか出さない)
    expect(resolveVisibleArenaCount({ totalCount: 150, perRow: 8, rows: 3, hardCap: 40 })).toBe(24);
  });
  it('hardCap 未指定なら人数連動(満席感): 大人数で40超まで伸びる', () => {
    // 405人・広い行(perRow20×段8=160)→ 動的cap=floor(405*0.2)=81 で頭打ち
    expect(resolveVisibleArenaCount({ totalCount: 405, perRow: 20, rows: 8 })).toBe(81);
    // 少人数は従来どおり下限40まで確保(perRow×rows が十分あれば total)
    expect(resolveVisibleArenaCount({ totalCount: 30, perRow: 20, rows: 8 })).toBe(30);
  });
});

describe('resolveDynamicArenaCap', () => {
  it('clamp(40, floor(total*0.2), 150)', () => {
    expect(resolveDynamicArenaCap(0)).toBe(40); // 下限
    expect(resolveDynamicArenaCap(100)).toBe(40); // 100*0.2=20 < 40 → 40
    expect(resolveDynamicArenaCap(405)).toBe(81); // 405*0.2=81
    expect(resolveDynamicArenaCap(1000)).toBe(150); // 1000*0.2=200 > 150 → 150
  });
  it('opts で base/ratio/max を上書きできる', () => {
    expect(resolveDynamicArenaCap(405, { ratio: 0.1 })).toBe(40); // 40.5→40, base40
    expect(resolveDynamicArenaCap(405, { max: 60 })).toBe(60); // 81 > 60 → 60
    expect(resolveDynamicArenaCap(405, { base: 100 })).toBe(100); // 81 < 100 → 100
  });
});

describe('resolveVenueMaxHeightVh', () => {
  it('人数が増えるほど会場が高くなる(満席感・映像セーフエリアは控えめ)', () => {
    expect(resolveVenueMaxHeightVh(5)).toBe(48);
    expect(resolveVenueMaxHeightVh(16)).toBe(48);
    expect(resolveVenueMaxHeightVh(64)).toBe(56);
    expect(resolveVenueMaxHeightVh(150)).toBe(64);
    expect(resolveVenueMaxHeightVh(405)).toBe(72);
  });
  it('上限 72vh を超えない(映像を覆いすぎない)', () => {
    expect(resolveVenueMaxHeightVh(99999)).toBe(72);
  });
});

describe('resolveVisibleAudienceCount', () => {
  it('観客は1〜2行に絞る(映像を覆わない)', () => {
    expect(resolveVisibleAudienceCount({ totalFaces: 183, perRow: 20, rows: 1, hardCap: 40 })).toBe(20);
    expect(resolveVisibleAudienceCount({ totalFaces: 183, perRow: 20, rows: 2, hardCap: 40 })).toBe(40);
    expect(resolveVisibleAudienceCount({ totalFaces: 10, perRow: 20, rows: 2, hardCap: 40 })).toBe(10);
  });
});

describe('selectStableVisibleMembers', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, name: `n${i}` }));

  it('cap以下ならそのまま', () => {
    expect(selectStableVisibleMembers(rows.slice(0, 3), 5)).toHaveLength(3);
  });

  it('capを超えたら先頭から安定して詰める(元順保持)', () => {
    const out = selectStableVisibleMembers(rows, 4);
    expect(out.map((r) => r.key)).toEqual(['k0', 'k1', 'k2', 'k3']);
  });

  it('直近発言者は枠外でも必ず含め、表示は元順に戻す(ちらつかない)', () => {
    // k8 が発言したら、本来 cap=4 では出ない k8 を含め、並びは元順(k0,k1,k2,k8)
    const out = selectStableVisibleMembers(rows, 4, new Set(['k8']));
    expect(out.map((r) => r.key)).toEqual(['k0', 'k1', 'k2', 'k8']);
  });

  it('複数発言者でも cap を超えない', () => {
    const out = selectStableVisibleMembers(rows, 3, new Set(['k7', 'k8', 'k9']));
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.key)).toEqual(['k7', 'k8', 'k9']);
  });

  it('同じ入力は同じ結果(決定的=ちらつき防止)', () => {
    const a = selectStableVisibleMembers(rows, 4, new Set(['k5']));
    const b = selectStableVisibleMembers(rows, 4, new Set(['k5']));
    expect(a.map((r) => r.key)).toEqual(b.map((r) => r.key));
  });

  it('空配列・cap0は空', () => {
    expect(selectStableVisibleMembers([], 5)).toEqual([]);
    expect(selectStableVisibleMembers(rows, 0)).toEqual([]);
  });
});
