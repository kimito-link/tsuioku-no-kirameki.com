import { describe, it, expect } from 'vitest';
import { makeInitialLaneDiag, buildLaneDiagSnapshot } from './laneDiag.js';

describe('laneDiag', () => {
  it('初期 state は全ゼロ/空', () => {
    expect(makeInitialLaneDiag()).toEqual({
      liveId: '',
      identified: 0,
      laneShown: 0,
      limit: 0,
      lastUpdateAt: 0
    });
  });

  it('観測値を snapshot に写し capturedAt を付ける', () => {
    const snap = buildLaneDiagSnapshot(
      { liveId: 'lv1', identified: 522, laneShown: 48, limit: 48, lastUpdateAt: 1000 },
      2000
    );
    expect(snap).toEqual({
      liveId: 'lv1',
      identified: 522,
      laneShown: 48,
      limit: 48,
      lastUpdateAt: 1000,
      capturedAt: 2000
    });
  });

  it('不正/欠落は初期値にフォールバック(壊れない)', () => {
    const snap = buildLaneDiagSnapshot(null, 0);
    expect(snap.liveId).toBe('');
    expect(snap.identified).toBe(0);
    const snap2 = buildLaneDiagSnapshot({ identified: 'x', laneShown: NaN }, 0);
    expect(snap2.identified).toBe(0);
    expect(snap2.laneShown).toBe(0);
  });
});
