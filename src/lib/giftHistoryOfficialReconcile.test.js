import { describe, it, expect } from 'vitest';
import {
  giftHistoryGapToOfficial,
  resolveGiftHistorySummaryPoints,
  appendUnattributedGiftRoom,
  reconcileGiftHistoryNorthStarContext,
  GIFT_HISTORY_UNATTRIBUTED_USER_KEY
} from './giftHistoryOfficialReconcile.js';

describe('giftHistoryGapToOfficial', () => {
  it('公式が履歴より大きいとき差分を返す', () => {
    expect(giftHistoryGapToOfficial(10790, 10970)).toBe(180);
  });

  it('公式が無いとき 0', () => {
    expect(giftHistoryGapToOfficial(1000, null)).toBe(0);
  });
});

describe('resolveGiftHistorySummaryPoints', () => {
  it('公式があるときサマリーは公式累計', () => {
    const r = resolveGiftHistorySummaryPoints({
      historySumAll: 10790,
      historySumDisplayed: 8000,
      officialProgramGiftPts: 10970
    });
    expect(r.summaryPoints).toBe(10970);
    expect(r.gapPoints).toBe(180);
    expect(r.usesOfficialSummary).toBe(true);
  });
});

describe('appendUnattributedGiftRoom', () => {
  it('差分行を足して再ソートする', () => {
    const rooms = appendUnattributedGiftRoom(
      [{ userKey: '1', nickname: 'A', count: 5000, avatarUrl: '' }],
      180,
      10
    );
    expect(rooms.some((r) => r.userKey === GIFT_HISTORY_UNATTRIBUTED_USER_KEY)).toBe(true);
    expect(rooms.find((r) => r.userKey === GIFT_HISTORY_UNATTRIBUTED_USER_KEY)?.count).toBe(
      180
    );
  });
});

describe('reconcileGiftHistoryNorthStarContext', () => {
  it('表示合計を公式に揃え rooms に未取得行を足す', () => {
    const out = reconcileGiftHistoryNorthStarContext({
      rooms: [{ userKey: 'u1', nickname: 'A', count: 10790, avatarUrl: '' }],
      pointsSumAll: 10790,
      pointsSumDisplayed: 10790,
      officialProgramGiftPts: 10970,
      maxRooms: 10
    });
    expect(out.pointsSumDisplayed).toBe(10970);
    expect(out.pointsSumAll).toBe(10970);
    expect(out.gapPoints).toBe(180);
    expect(
      out.rooms.some((r) => r.userKey === GIFT_HISTORY_UNATTRIBUTED_USER_KEY)
    ).toBe(true);
  });
});
