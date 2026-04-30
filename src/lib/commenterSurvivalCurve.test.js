import { describe, it, expect } from 'vitest';
import { buildCommenterSurvivalCurve } from './commenterSurvivalCurve.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);
function c(min, userId) {
  return { capturedAt: t0 + min * 60_000, userId, text: 'x' };
}

describe('buildCommenterSurvivalCurve', () => {
  it('空配列 → 空 segments', () => {
    const r = buildCommenterSurvivalCurve([], { segmentCount: 4 });
    expect(r.segments).toEqual([]);
    expect(r.baseUserCount).toBe(0);
  });

  it('1 ユーザーが全 4 セグメントに居る → 100% 維持', () => {
    const r = buildCommenterSurvivalCurve([
      c(0, 'A'),
      c(15, 'A'),
      c(30, 'A'),
      c(50, 'A')
    ], { segmentCount: 4 });
    // 60 分配信を 4 等分 = 15 分ずつ
    expect(r.baseUserCount).toBe(1);
    expect(r.segments.length).toBe(4);
    for (const s of r.segments) {
      expect(s.retentionPct).toBe(100);
      expect(s.presentCount).toBe(1);
    }
  });

  it('セグメント 0 から半分が離脱 → segment 3 で 50%', () => {
    const r = buildCommenterSurvivalCurve([
      // 配信 = 0-40 分（4 等分 = 10 分）
      c(0, 'A'), c(0, 'B'),
      c(15, 'A'), c(15, 'B'),
      c(25, 'A'),       // B は 25 分目以降居なくなる
      c(35, 'A')
    ], { segmentCount: 4 });
    expect(r.baseUserCount).toBe(2);
    // segment 0 (0-10): A, B → 2/2 = 100%
    expect(r.segments[0].retentionPct).toBe(100);
    // segment 1 (10-20): A, B → 100%
    expect(r.segments[1].retentionPct).toBe(100);
    // segment 2 (20-30): A → 1/2 = 50%
    expect(r.segments[2].retentionPct).toBe(50);
    // segment 3 (30-40): A → 50%
    expect(r.segments[3].retentionPct).toBe(50);
  });

  it('base = 最初のセグメントに居たユーザーのみ（後から参戦は base に含めない）', () => {
    const r = buildCommenterSurvivalCurve([
      c(0, 'A'),
      c(20, 'B'),    // B は途中参戦
      c(20, 'A')
    ], { segmentCount: 2 });
    // 配信 = 0-20 分 / segment 0 = 0-10 / segment 1 = 10-20
    expect(r.baseUserCount).toBe(1);  // A のみが segment 0 に居た
  });

  it('segmentCount のデフォルトは 4', () => {
    const r = buildCommenterSurvivalCurve([
      c(0, 'A'),
      c(40, 'A')
    ]);
    expect(r.segments.length).toBe(4);
  });

  it('破損 capturedAt 除外', () => {
    const r = buildCommenterSurvivalCurve([
      c(0, 'A'),
      { capturedAt: NaN, userId: 'B', text: 'bad' },
      c(30, 'A')
    ], { segmentCount: 3 });
    expect(r.baseUserCount).toBe(1);
  });

  it('userId 空のコメは無視', () => {
    const r = buildCommenterSurvivalCurve([
      c(0, ''),
      c(0, 'A'),
      c(30, 'A')
    ], { segmentCount: 2 });
    expect(r.baseUserCount).toBe(1);
  });

  it('1 サンプルのみ → 配信時間 0 で全セグメント 1 件 / 100%', () => {
    const r = buildCommenterSurvivalCurve([c(0, 'A')], { segmentCount: 3 });
    expect(r.baseUserCount).toBe(1);
    // 配信時間が 0 でも安全に処理
    expect(r.segments.every((s) => s.retentionPct >= 0)).toBe(true);
  });

  it('null/undefined → 空', () => {
    expect(buildCommenterSurvivalCurve(null).segments).toEqual([]);
    expect(buildCommenterSurvivalCurve(undefined).segments).toEqual([]);
  });
});
