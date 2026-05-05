import { describe, it, expect } from 'vitest';
import { topSupportRankStripStableKey } from './topSupportRankStripStableKey.js';
import { UNKNOWN_USER_KEY } from './userRooms.js';

describe('topSupportRankStripStableKey', () => {
  it('liveId と件数と空行で安定キー', () => {
    expect(topSupportRankStripStableKey('lv123', 0, [])).toBe('lv123\n0\n');
    expect(topSupportRankStripStableKey('LV123', 5, [])).toBe('lv123\n5\n');
  });

  it('上位行の userKey:count が変わるとキーが変わる', () => {
    const a = [{ userKey: 'u1', count: 10 }];
    const b = [{ userKey: 'u1', count: 11 }];
    expect(topSupportRankStripStableKey('lv1', 100, a)).not.toBe(
      topSupportRankStripStableKey('lv1', 100, b)
    );
  });

  it('総件数だけ変わるとキーが変わる（11位以下の増加など）', () => {
    const rows = [{ userKey: 'u1', count: 10 }];
    expect(topSupportRankStripStableKey('lv1', 100, rows)).not.toBe(
      topSupportRankStripStableKey('lv1', 101, rows)
    );
  });

  it('並びと中身が同じならキー同じ', () => {
    const rows = [
      { userKey: 'a', count: 3 },
      { userKey: UNKNOWN_USER_KEY, count: 2 }
    ];
    expect(topSupportRankStripStableKey('lv1', 50, rows)).toBe(
      topSupportRankStripStableKey('lv1', 50, rows)
    );
  });

  it('件数不変で表示名だけ変わるとキーが変わる', () => {
    const a = [{ userKey: 'u1', count: 10, nickname: 'stack_ice_cup' }];
    const b = [{ userKey: 'u1', count: 10, nickname: 'Quma' }];
    expect(topSupportRankStripStableKey('lv1', 100, a)).not.toBe(
      topSupportRankStripStableKey('lv1', 100, b)
    );
  });
});
