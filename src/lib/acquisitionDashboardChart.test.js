import { describe, it, expect } from 'vitest';
import {
  computeAcquisitionPercents,
  computeRadarPolygonPoints,
  computeAcquisitionPieGradient,
  ACQUISITION_RADAR_GEOMETRY
} from './acquisitionDashboardChart.js';

describe('computeAcquisitionPercents', () => {
  it('total=0 のとき全て 0、commentPct は公式無しで null', () => {
    const r = computeAcquisitionPercents({ avatarStats: { total: 0 }, snapshot: null, displayCount: 0 });
    expect(r).toEqual({ thumb: 0, idPct: 0, nick: 0, commentPct: null, total: 0 });
  });

  it('withResolvedAvatar 優先で thumb を出す（total で頭打ち）', () => {
    const r = computeAcquisitionPercents({
      avatarStats: { total: 10, withHttpAvatar: 3, withResolvedAvatar: 8, missingUserId: 2, withNickname: 5 },
      snapshot: { officialCommentCount: 0 },
      displayCount: 50
    });
    expect(r.thumb).toBeCloseTo(80, 5); // 8/10
    expect(r.idPct).toBeCloseTo(80, 5); // (10-2)/10
    expect(r.nick).toBeCloseTo(50, 5); // 5/10
    expect(r.commentPct).toBeNull(); // oc=0 → null
  });

  it('withResolvedAvatar 無しは withHttpAvatar で thumb', () => {
    const r = computeAcquisitionPercents({
      avatarStats: { total: 4, withHttpAvatar: 1, missingUserId: 0, withNickname: 4 },
      snapshot: null,
      displayCount: 0
    });
    expect(r.thumb).toBeCloseTo(25, 5); // 1/4
  });

  it('commentPct は displayCount/officialCommentCount を 100 上限で', () => {
    const r = computeAcquisitionPercents({
      avatarStats: { total: 1, withHttpAvatar: 1, missingUserId: 0, withNickname: 1 },
      snapshot: { officialCommentCount: 200 },
      displayCount: 50
    });
    expect(r.commentPct).toBeCloseTo(25, 5); // 50/200
  });

  it('displayCount > officialCommentCount でも 100 上限', () => {
    const r = computeAcquisitionPercents({
      avatarStats: { total: 1, withHttpAvatar: 1, missingUserId: 0, withNickname: 1 },
      snapshot: { officialCommentCount: 10 },
      displayCount: 999
    });
    expect(r.commentPct).toBe(100);
  });

  it('入力欠落でも例外を投げない', () => {
    const r = computeAcquisitionPercents(undefined);
    expect(r.total).toBe(0);
    expect(r.commentPct).toBeNull();
  });
});

describe('computeRadarPolygonPoints', () => {
  it('既定ジオメトリ(cx60,cy60,R44)で上始まり時計回りの座標を返す', () => {
    const { polyPts, ringPts, midPts, axisLines } = computeRadarPolygonPoints(
      [100, 100, 100, 100],
      ACQUISITION_RADAR_GEOMETRY
    );
    // 100% のとき polyPts は ringPts と一致するはず
    expect(polyPts).toBe(ringPts);
    // 上(軸0)は (60, 16)、右(軸1)は (104, 60)
    expect(ringPts.split(' ')[0]).toBe('60.00,16.00');
    expect(ringPts.split(' ')[1]).toBe('104.00,60.00');
    // midPts は R*0.5 半径
    expect(midPts.split(' ')[0]).toBe('60.00,38.00');
    // axisLines は 4 本の <line>
    expect((axisLines.match(/<line /g) || []).length).toBe(4);
  });

  it('0% のとき polygon は中心に潰れる', () => {
    const { polyPts } = computeRadarPolygonPoints([0, 0, 0, 0]);
    expect(polyPts).toBe('60.00,60.00 60.00,60.00 60.00,60.00 60.00,60.00');
  });

  it('100 超は 100 にクランプ、負は 0 にクランプ', () => {
    const over = computeRadarPolygonPoints([999, 0, 0, 0]);
    const ring = computeRadarPolygonPoints([100, 0, 0, 0]);
    expect(over.polyPts.split(' ')[0]).toBe(ring.polyPts.split(' ')[0]);
    const neg = computeRadarPolygonPoints([-50, 0, 0, 0]);
    expect(neg.polyPts.split(' ')[0]).toBe('60.00,60.00'); // 0 と同じ
  });
});

describe('computeAcquisitionPieGradient', () => {
  it('合計 0 は中立色', () => {
    expect(computeAcquisitionPieGradient({ thumb: 0, idPct: 0, nick: 0, commentPct: null })).toBe(
      '#94a3b8'
    );
  });

  it('均等 4 分割は各 90deg の conic-gradient', () => {
    const g = computeAcquisitionPieGradient({ thumb: 25, idPct: 25, nick: 25, commentPct: 25 });
    expect(g).toBe(
      'conic-gradient(#0f8fd8 0deg 90deg,#6366f1 90deg 180deg,#ea580c 180deg 270deg,#0d9488 270deg 360deg)'
    );
  });

  it('commentPct=null は comment 分 0 として扱う', () => {
    const g = computeAcquisitionPieGradient({ thumb: 50, idPct: 50, nick: 0, commentPct: null });
    // thumb と id が半々 → 0-180, 180-360
    expect(g).toBe(
      'conic-gradient(#0f8fd8 0deg 180deg,#6366f1 180deg 360deg,#ea580c 360deg 360deg,#0d9488 360deg 360deg)'
    );
  });

  it('入力欠落でも中立色', () => {
    expect(computeAcquisitionPieGradient(undefined)).toBe('#94a3b8');
  });
});
