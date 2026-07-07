import { describe, it, expect } from 'vitest';
import { buildRoomHeatMirrorSnapshot, restoreRoomHeatMirror } from './roomHeatMirror.js';

const NOW = 1_000_000_000_000;

describe('buildRoomHeatMirrorSnapshot', () => {
  it('①の室温4値を JSON-safe に取り出す', () => {
    const snap = buildRoomHeatMirrorSnapshot(
      { total: 42, active: 8, heatPercent: 63.5, heatText: '増加が大きい' },
      { liveId: 'LV1', nowMs: NOW }
    );
    expect(snap).toEqual({ liveId: 'lv1', capturedAt: NOW, total: 42, active: 8, heatPercent: 63.5, heatText: '増加が大きい' });
  });

  it('heatPercent は 0〜100 にクランプ', () => {
    expect(buildRoomHeatMirrorSnapshot({ total: 1, heatPercent: 150 }, { liveId: 'lv1' }).heatPercent).toBe(100);
    expect(buildRoomHeatMirrorSnapshot({ total: 1, heatPercent: -5 }, { liveId: 'lv1' }).heatPercent).toBe(0);
  });

  it('total/active は非負整数に正規化', () => {
    const snap = buildRoomHeatMirrorSnapshot({ total: 3.9, active: -2, heatText: 'x' }, { liveId: 'lv1' });
    expect(snap.total).toBe(3);
    expect(snap.active).toBe(0);
  });

  it('全ゼロ+文言空なら null(空パネルにしない)', () => {
    expect(buildRoomHeatMirrorSnapshot({ total: 0, active: 0, heatPercent: 0, heatText: '' }, { liveId: 'lv1' })).toBe(null);
    expect(buildRoomHeatMirrorSnapshot(null)).toBe(null);
    expect(buildRoomHeatMirrorSnapshot(undefined)).toBe(null);
  });

  it('文言だけでも(増加は少なめ等)鏡になる', () => {
    const snap = buildRoomHeatMirrorSnapshot({ total: 0, active: 0, heatPercent: 0, heatText: '増加は少なめ' }, { liveId: 'lv1' });
    expect(snap).not.toBe(null);
    expect(snap.heatText).toBe('増加は少なめ');
  });

  it('HTML文字列を持ち込まない(構造化クローン可能=storage安全)', () => {
    const snap = buildRoomHeatMirrorSnapshot({ total: 5, active: 2, heatPercent: 30, heatText: '増加あり', evil: () => {} }, { liveId: 'lv1', nowMs: NOW });
    expect(() => structuredClone(snap)).not.toThrow();
    expect(snap).not.toHaveProperty('evil');
    expect(JSON.stringify(snap)).not.toContain('<');
  });
});

describe('restoreRoomHeatMirror', () => {
  it('null-safe に復元', () => {
    const snap = buildRoomHeatMirrorSnapshot({ total: 10, active: 3, heatPercent: 40, heatText: '増加あり' }, { liveId: 'lv1', nowMs: NOW });
    expect(restoreRoomHeatMirror(snap)).toEqual(snap);
  });

  it('null/空は null', () => {
    expect(restoreRoomHeatMirror(null)).toBe(null);
    expect(restoreRoomHeatMirror({})).toBe(null);
    expect(restoreRoomHeatMirror({ total: 0, active: 0, heatPercent: 0, heatText: '' })).toBe(null);
  });
});
