import { describe, expect, it } from 'vitest';
import { GIFT_RANK_STRIP_MAX } from './giftRankStripConfig.js';
import {
  prepareGiftRankStrip,
  prepareGiftUsersForRankStrip,
  formatGiftThrowGapLabel,
  formatLeaderGapLabel
} from './giftRankStripPrep.js';
import { mergeGiftUsers } from './giftRecord.js';

describe('prepareGiftRankStrip', () => {
  it('空配列は stripRooms / stableKeyRows とも空', () => {
    const { stripRooms, stableKeyRows } = prepareGiftRankStrip([]);
    expect(stripRooms).toEqual([]);
    expect(stableKeyRows).toEqual([]);
  });

  it('配信者 UID は strip に含めない', () => {
    const raw = [
      { userId: '111', nickname: 'A', throwCount: 5, capturedAt: 100 },
      { userId: '222', nickname: 'B', throwCount: 3, capturedAt: 200 }
    ];
    const { stripRooms } = prepareGiftRankStrip(raw, { broadcasterUid: '111' });
    expect(stripRooms.map((r) => r.userKey)).toEqual(['222']);
  });

  it('throwCount 降順、同率は capturedAt 降順、さらに同率は userId 昇順', () => {
    const raw = [
      { userId: '3', nickname: '', throwCount: 2, capturedAt: 50 },
      { userId: '1', nickname: '', throwCount: 2, capturedAt: 100 },
      { userId: '2', nickname: '', throwCount: 2, capturedAt: 100 }
    ];
    const { stripRooms } = prepareGiftRankStrip(raw);
    expect(stripRooms.map((r) => r.userKey)).toEqual(['1', '2', '3']);
  });

  it('throwCount 省略・不正は正規化（1）', () => {
    const { stripRooms } = prepareGiftRankStrip([
      { userId: '9', nickname: 'x', throwCount: undefined, capturedAt: 1 }
    ]);
    expect(stripRooms[0].count).toBe(1);
  });

  it('同一 userId が複数行でも throwCount は max でマージ', () => {
    const { stripRooms, stableKeyRows } = prepareGiftRankStrip([
      { userId: '1', nickname: 'a', throwCount: 3, capturedAt: 10 },
      { userId: '1', nickname: 'b', throwCount: 7, capturedAt: 20 }
    ]);
    expect(stripRooms).toHaveLength(1);
    expect(stripRooms[0].count).toBe(7);
    expect(stripRooms[0].nickname).toBe('a');
    expect(stableKeyRows[0].throwCount).toBe(7);
    expect(stableKeyRows[0].capturedAt).toBe(20);
  });

  it(`上位 ${GIFT_RANK_STRIP_MAX} 件に切り詰める`, () => {
    const raw = Array.from({ length: 20 }, (_, i) => ({
      userId: String(100 + i),
      nickname: '',
      throwCount: 20 - i,
      capturedAt: 1000
    }));
    const { stripRooms } = prepareGiftRankStrip(raw);
    expect(stripRooms).toHaveLength(GIFT_RANK_STRIP_MAX);
  });

  it('opts.max で上限を下げられる', () => {
    const raw = [
      { userId: '1', throwCount: 5, capturedAt: 1 },
      { userId: '2', throwCount: 4, capturedAt: 1 },
      { userId: '3', throwCount: 3, capturedAt: 1 }
    ];
    const { stripRooms } = prepareGiftRankStrip(raw, { max: 2 });
    expect(stripRooms).toHaveLength(2);
    expect(stripRooms[0].userKey).toBe('1');
    expect(stripRooms[1].userKey).toBe('2');
  });
});

describe('formatGiftThrowGapLabel', () => {
  it('1位相当（順位1）は空', () => {
    expect(formatGiftThrowGapLabel(1, 10, 10)).toBe('');
  });
  it('2位で差があるときは「1位まであとN回」', () => {
    expect(formatGiftThrowGapLabel(2, 3, 10)).toBe('1位まであと7回');
  });
  it('同回数なら最多タイ', () => {
    expect(formatGiftThrowGapLabel(2, 10, 10)).toBe('最多タイ');
  });
});

describe('formatLeaderGapLabel', () => {
  it('単位が件のときは「1位まであとN件」', () => {
    expect(formatLeaderGapLabel(2, 4, 12, '件')).toBe('1位まであと8件');
  });
  it('単位が件でも同数なら最多タイ', () => {
    expect(formatLeaderGapLabel(3, 5, 5, '件')).toBe('最多タイ');
  });
  it('不正な単位は回にフォールバック', () => {
    expect(formatLeaderGapLabel(2, 1, 3, 'x')).toBe('1位まであと2回');
  });
});

describe('prepareGiftUsersForRankStrip', () => {
  it('stripRooms のエイリアス', () => {
    expect(
      prepareGiftUsersForRankStrip([
        { userId: '1', nickname: 'n', throwCount: 2, capturedAt: 1 }
      ])
    ).toEqual([{ userKey: '1', nickname: 'n', count: 2 }]);
  });
});

// v0.1.215: anonymous gift（uid 空 + nickname あり）が popup「ユーザー別の
//   応援件数」 fallback で表示されることを保証する integration test。
//   mergeGiftUsers が __anon_<nickname> を userId field に保存し、
//   prepareGiftRankStrip がそれを stripRooms に流す経路を end-to-end で確認。
describe('mergeGiftUsers → prepareGiftRankStrip integration（anonymous）', () => {
  it('anonymous gift の userKey が __anon_<nickname> として stripRooms に出る', () => {
    const merged = mergeGiftUsers([], [
      { userId: '12345', nickname: '通常ユーザ' },
      { userId: '', nickname: 'ペチパー' }
    ]).next;
    // throwCount は merge 側で持たないので prepareGiftRankStrip の正規化で 1 になる
    const { stripRooms } = prepareGiftRankStrip(merged);
    const userKeys = stripRooms.map((r) => r.userKey).sort();
    expect(userKeys).toContain('12345');
    expect(userKeys).toContain('__anon_ペチパー');
  });

  it('同名 anonymous は 1 つの stripRooms 行に集約', () => {
    const merged = mergeGiftUsers([], [
      { userId: '', nickname: '同名' },
      { userId: '', nickname: '同名' },
      { userId: '', nickname: '別名' }
    ]).next;
    const { stripRooms } = prepareGiftRankStrip(merged);
    expect(stripRooms).toHaveLength(2);
    const keys = stripRooms.map((r) => r.userKey).sort();
    expect(keys).toEqual(['__anon_別名', '__anon_同名']);
  });

  it('anonymous gift の nickname も stripRooms に反映', () => {
    const merged = mergeGiftUsers([], [
      { userId: '', nickname: 'リン' }
    ]).next;
    const { stripRooms } = prepareGiftRankStrip(merged);
    expect(stripRooms[0].userKey).toBe('__anon_リン');
    expect(stripRooms[0].nickname).toBe('リン');
  });
});
