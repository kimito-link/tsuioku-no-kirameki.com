import { describe, expect, it } from 'vitest';
import {
  createLaneTickProbe,
  recordLaneTick,
  snapshotLaneTickProbe,
  LANE_TICK_REASONS,
  LANE_TICK_LID_SOURCES
} from './laneTickProbe.js';

describe('laneTickProbe(v0.1.1123 D-0計器)', () => {
  it('結末を理由別に数える(lidMiss支配=lid解決全滅が真因、の実測材料)', () => {
    const p = createLaneTickProbe();
    recordLaneTick(p, LANE_TICK_REASONS.DOC_HIDDEN);
    recordLaneTick(p, LANE_TICK_REASONS.DEFER_HEAVY);
    recordLaneTick(p, LANE_TICK_REASONS.LID_MISS);
    recordLaneTick(p, LANE_TICK_REASONS.LID_MISS);
    recordLaneTick(p, LANE_TICK_REASONS.RUN, {
      lidSource: LANE_TICK_LID_SOURCES.SNAPSHOT,
      lid: 'lv123',
      nowMs: 1_000
    });
    const s = snapshotLaneTickProbe(p, 4_000);
    expect(s).toMatchObject({
      ticks: 5,
      runs: 1,
      docHidden: 1,
      deferHeavy: 1,
      lidMiss: 2,
      lidFromSnapshot: 1,
      lidFromInline: 0,
      lastReason: 'run',
      lastLid: 'lv123',
      lastRunAgoMs: 3_000
    });
  });

  it('一度も run が無ければ lastRunAgoMs=null(未起動が数字で分かる)', () => {
    const p = createLaneTickProbe();
    recordLaneTick(p, LANE_TICK_REASONS.LID_MISS);
    const s = snapshotLaneTickProbe(p, 9_999);
    expect(s.runs).toBe(0);
    expect(s.lastRunAgoMs).toBeNull();
    expect(s.lastReason).toBe('lid-miss');
  });

  it('不正入力で throw しない', () => {
    expect(() => recordLaneTick(null, 'run')).not.toThrow();
    expect(snapshotLaneTickProbe(null, 0)).toBeNull();
  });
});
