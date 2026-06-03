import { describe, it, expect } from 'vitest';
import { buildGiftHistoryNorthStarPaintKey } from './giftHistoryNorthStarPaintKey.js';

describe('buildGiftHistoryNorthStarPaintKey', () => {
  it('同じデータなら同じキー', () => {
    const base = {
      liveId: 'lv123',
      rooms: [{ userKey: 'u1', count: 100 }],
      noteText: 'note',
      pointsSumAll: 100,
      pointsSumDisplayed: 100,
      officialProgramGiftPts: 100,
      throwsTableHtml: '<table></table>'
    };
    expect(buildGiftHistoryNorthStarPaintKey(base)).toBe(
      buildGiftHistoryNorthStarPaintKey({ ...base })
    );
  });

  it('鮮度用の差分はキーに含めない（rooms が同じなら同一）', () => {
    const a = buildGiftHistoryNorthStarPaintKey({
      liveId: 'lv1',
      rooms: [{ userKey: 'a', count: 50 }]
    });
    const b = buildGiftHistoryNorthStarPaintKey({
      liveId: 'lv1',
      rooms: [{ userKey: 'a', count: 50 }]
    });
    expect(a).toBe(b);
  });

  it('公式累計が変わればキーが変わる', () => {
    const a = buildGiftHistoryNorthStarPaintKey({
      liveId: 'lv1',
      rooms: [{ userKey: 'a', count: 50 }],
      officialProgramGiftPts: 1000
    });
    const b = buildGiftHistoryNorthStarPaintKey({
      liveId: 'lv1',
      rooms: [{ userKey: 'a', count: 50 }],
      officialProgramGiftPts: 1100
    });
    expect(a).not.toBe(b);
  });
});
