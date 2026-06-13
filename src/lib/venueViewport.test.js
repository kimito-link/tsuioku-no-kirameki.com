import { describe, it, expect } from 'vitest';
import {
  seatsPerRow,
  resolveVisibleArenaCount,
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
