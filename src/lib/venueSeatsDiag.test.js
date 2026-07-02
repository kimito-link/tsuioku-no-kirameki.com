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
});
