import { describe, it, expect } from 'vitest';
import {
  makeInitialVenueSeatsDiag,
  buildVenueSeatsDiagSnapshot,
  classifyVenueVisibleCapReason
} from './venueSeatsDiag.js';

describe('classifyVenueVisibleCapReason', () => {
  it('participant が最小=全員可視(絞られていない)', () => {
    // 266人・perRow=10・段=27 → grid=270 >= 266、hardCap=500。最小は participant。
    expect(
      classifyVenueVisibleCapReason({
        participantCount: 266,
        perRow: 10,
        venueMaxRows: 27,
        hardCap: 500
      })
    ).toBe('participant');
  });

  it('grid が最小=列×段で頭打ち(画面幅/レイアウト起因)', () => {
    // 266人だが perRow=4・段=8 → grid=32 が最小。多数がはみ出す=絞られている。
    expect(
      classifyVenueVisibleCapReason({
        participantCount: 266,
        perRow: 4,
        venueMaxRows: 8,
        hardCap: 500
      })
    ).toBe('grid');
  });

  it('hardCap が最小=席プール上限(超大型配信)', () => {
    // 800人・perRow=20・段=40 → grid=800、participant=800、hardCap=500 が最小。
    expect(
      classifyVenueVisibleCapReason({
        participantCount: 800,
        perRow: 20,
        venueMaxRows: 40,
        hardCap: 500
      })
    ).toBe('hardCap');
  });

  it('値が揃わない(perRow=0 等)は判定不能で空文字', () => {
    expect(
      classifyVenueVisibleCapReason({ participantCount: 100, perRow: 0, venueMaxRows: 5, hardCap: 500 })
    ).toBe('');
    expect(classifyVenueVisibleCapReason({})).toBe('');
    expect(classifyVenueVisibleCapReason(null)).toBe('');
  });

  it('同値のときは participant を最優先で報告(絞られていないことを優先)', () => {
    // participant=grid=hardCap=100 のとき participant を返す。
    expect(
      classifyVenueVisibleCapReason({
        participantCount: 100,
        perRow: 10,
        venueMaxRows: 10,
        hardCap: 100
      })
    ).toBe('participant');
  });
});

describe('mirrorIntake の素通し(v0.1.1405)', () => {
  /*
   * ★この関数は「フィールドを個別列挙して作り直す」型。
   *   ここに足し忘れると venueBar が載せても **黙って落ちる**
   *   ([[venue-mirror-is-the-primary-path-2026-08-01]] を5回踏んだ箇所)。
   *   ＝ 書き手が載せたものが読み手に届くことを、この test で固定する。
   */
  it('★書き手が載せた判定材料が落ちずに通る', () => {
    const snap = buildVenueSeatsDiagSnapshot(
      {
        enabled: true,
        mirrorIntake: {
          changedEvents: 5, keyMatched: 0, keyMissed: 3, accepted: 0, rejectedByGate: 1,
          lastMissedKeys: ['nls_lane_mirror_lv999'], lastExpectedKey: 'nls_lane_mirror_lv1',
          lastAcceptedAt: 123, lastRejectReason: 'liveId不一致'
        }
      },
      1000
    );
    expect(snap.mirrorIntake).not.toBeNull();
    expect(snap.mirrorIntake?.keyMissed).toBe(3);
    expect(snap.mirrorIntake?.lastExpectedKey).toBe('nls_lane_mirror_lv1');
    expect(snap.mirrorIntake?.lastMissedKeys).toEqual(['nls_lane_mirror_lv999']);
    expect(snap.mirrorIntake?.lastRejectReason).toBe('liveId不一致');
  });

  it('未観測なら null(嘘の0を作らない)', () => {
    const snap = buildVenueSeatsDiagSnapshot({ enabled: true }, 1000);
    expect(snap.mirrorIntake).toBeNull();
  });
});

describe('buildVenueSeatsDiagSnapshot 新フィールド', () => {
  it('perRow/venueMaxRows/seatAreaWidth を数値で載せ、reason を導出する', () => {
    const snap = buildVenueSeatsDiagSnapshot(
      {
        enabled: true,
        seatsShown: 32,
        participantCount: 266,
        perRow: 4,
        venueMaxRows: 8,
        seatAreaWidth: 880,
        hardCap: 500
      },
      1000
    );
    expect(snap.perRow).toBe(4);
    expect(snap.venueMaxRows).toBe(8);
    expect(snap.seatAreaWidth).toBe(880);
    expect(snap.visibleCapReason).toBe('grid'); // 導出
    expect(snap.capturedAt).toBe(1000);
  });

  it('明示 visibleCapReason があればそれを尊重する', () => {
    const snap = buildVenueSeatsDiagSnapshot(
      {
        enabled: true,
        participantCount: 266,
        perRow: 4,
        venueMaxRows: 8,
        hardCap: 500,
        visibleCapReason: 'participant'
      },
      1
    );
    expect(snap.visibleCapReason).toBe('participant');
  });

  it('未指定は初期値0/空文字(後方互換)', () => {
    const snap = buildVenueSeatsDiagSnapshot({ enabled: true }, 1);
    const base = makeInitialVenueSeatsDiag();
    expect(snap.perRow).toBe(base.perRow);
    expect(snap.venueMaxRows).toBe(base.venueMaxRows);
    expect(snap.seatAreaWidth).toBe(base.seatAreaWidth);
    expect(snap.visibleCapReason).toBe('');
  });

  it('storyDiagMirror は present/ageSec の2フィールドだけを通す(状態速報への計器)', () => {
    const snap = buildVenueSeatsDiagSnapshot(
      {
        enabled: true,
        storyDiagMirror: { present: true, ageSec: 7, extra: 'ignored' }
      },
      1000
    );
    expect(snap.storyDiagMirror).toEqual({ present: true, ageSec: 7 });

    const empty = buildVenueSeatsDiagSnapshot({ enabled: true }, 1000);
    expect(empty.storyDiagMirror).toEqual({ present: false, ageSec: null });
  });
});
