import { describe, it, expect } from 'vitest';
import { UNKNOWN_USER_KEY } from './userRooms.js';
import {
  accentSlotFromUserKey,
  accentOklchForSlot,
  accentColorForSlot,
  accentSlotFromSupportEntry,
  supportUserKeyFromEntry,
  supportOrdinalForIndex,
  supportSameUserTotalInEntries,
  buildSupportAccentIndex,
  ACCENT_OKLCH_LIGHT,
  ACCENT_OKLCH_DARK,
  ACCENT_HEX_LIGHT
} from './userSupportGridAccent.js';

describe('accentSlotFromUserKey', () => {
  it('同じキーは同じスロット', () => {
    expect(accentSlotFromUserKey('a:DrGpMc3qxk3QZ-bs')).toBe(
      accentSlotFromUserKey('a:DrGpMc3qxk3QZ-bs')
    );
  });

  it('UNKNOWN・空は null', () => {
    expect(accentSlotFromUserKey('')).toBeNull();
    expect(accentSlotFromUserKey('   ')).toBeNull();
    expect(accentSlotFromUserKey(UNKNOWN_USER_KEY)).toBeNull();
  });

  it('通常キーは 0–7', () => {
    const s = accentSlotFromUserKey('a:foo');
    expect(s).not.toBeNull();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(8);
  });
});

describe('accentOklchForSlot', () => {
  it('範囲外は null', () => {
    expect(accentOklchForSlot(-1, 'light')).toBeNull();
    expect(accentOklchForSlot(8, 'light')).toBeNull();
    expect(accentOklchForSlot(3.5, 'light')).toBeNull();
  });

  it('light/dark で配列と一致', () => {
    for (let i = 0; i < 8; i += 1) {
      expect(accentOklchForSlot(i, 'light')).toBe(ACCENT_OKLCH_LIGHT[i]);
      expect(accentOklchForSlot(i, 'dark')).toBe(ACCENT_OKLCH_DARK[i]);
    }
  });

  it('oklch 文字列形式', () => {
    const c = accentOklchForSlot(0, 'light');
    expect(c).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
  });
});

describe('accentColorForSlot', () => {
  it('HEX と配列一致', () => {
    for (let i = 0; i < 8; i += 1) {
      expect(accentColorForSlot(i, 'light')).toBe(ACCENT_HEX_LIGHT[i]);
      expect(accentColorForSlot(i, 'light')).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('accentSlotFromSupportEntry', () => {
  it('userId があれば userId ベース', () => {
    const s1 = accentSlotFromSupportEntry(
      { userId: 'a:foo' },
      { tileSrc: 'https://x/a.png', defaultTileSrc: '' }
    );
    expect(s1).toBe(accentSlotFromUserKey('a:foo'));
  });

  it('userId がなくタイルが既定と異なればタイル URL で決定', () => {
    const a = accentSlotFromSupportEntry(
      { nickname: 'n' },
      { tileSrc: 'https://cdn/a.jpg', defaultTileSrc: 'images/default.png' }
    );
    const b = accentSlotFromSupportEntry(
      { nickname: 'n' },
      { tileSrc: 'https://cdn/b.jpg', defaultTileSrc: 'images/default.png' }
    );
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it('タイルが既定のみなら stableId を使う', () => {
    const def = 'images/default.png';
    const a = accentSlotFromSupportEntry(
      {},
      { tileSrc: def, defaultTileSrc: def, stableId: 'id-a' }
    );
    const b = accentSlotFromSupportEntry(
      {},
      { tileSrc: def, defaultTileSrc: def, stableId: 'id-b' }
    );
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });
});

describe('supportUserKeyFromEntry', () => {
  it('userId 優先', () => {
    expect(supportUserKeyFromEntry({ userId: ' u1 ', nickname: 'n' })).toBe('u1');
  });

  it('空 userId は UNKNOWN', () => {
    expect(supportUserKeyFromEntry({ nickname: 'x' })).toBe(UNKNOWN_USER_KEY);
  });
});

describe('supportOrdinalForIndex', () => {
  it('範囲外は 0', () => {
    expect(supportOrdinalForIndex([], 0)).toBe(0);
    expect(supportOrdinalForIndex([{ userId: 'a' }], -1)).toBe(0);
    expect(supportOrdinalForIndex([{ userId: 'a' }], 1)).toBe(0);
  });

  it('同一 userId の表示順 ordinal', () => {
    const entries = [
      { userId: 'a' },
      { userId: 'b' },
      { userId: 'a' },
      { userId: 'a' }
    ];
    expect(supportOrdinalForIndex(entries, 0)).toBe(1);
    expect(supportOrdinalForIndex(entries, 1)).toBe(1);
    expect(supportOrdinalForIndex(entries, 2)).toBe(2);
    expect(supportOrdinalForIndex(entries, 3)).toBe(3);
  });

  it('userId なしは同一 UNKNOWN として数える', () => {
    const entries = [{ nickname: 'x' }, { nickname: 'y' }];
    expect(supportOrdinalForIndex(entries, 0)).toBe(1);
    expect(supportOrdinalForIndex(entries, 1)).toBe(2);
  });
});

describe('supportSameUserTotalInEntries', () => {
  it('全体件数', () => {
    const entries = [{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }];
    expect(supportSameUserTotalInEntries(entries, 'a')).toBe(2);
    expect(supportSameUserTotalInEntries(entries, 'b')).toBe(1);
  });
});

describe('buildSupportAccentIndex', () => {
  it('offset=0 全件は per-cell の supportOrdinalForIndex / Total と完全一致', () => {
    const entries = [
      { userId: 'a' },
      { userId: 'b' },
      { userId: 'a' },
      { nickname: 'x' },
      { userId: 'a' },
      { nickname: 'y' }
    ];
    const { ordinals, totals } = buildSupportAccentIndex(entries);
    expect(ordinals).toHaveLength(entries.length);
    for (let i = 0; i < entries.length; i += 1) {
      expect(ordinals[i]).toBe(supportOrdinalForIndex(entries, i));
      const key = supportUserKeyFromEntry(entries[i]);
      expect(totals[i]).toBe(supportSameUserTotalInEntries(entries, key));
    }
    // userId なしはまとめて UNKNOWN として数える
    expect(ordinals).toEqual([1, 1, 2, 1, 3, 2]);
    expect(totals).toEqual([3, 1, 3, 2, 3, 2]);
  });

  it('ウィンドウ（offset>0）は窓内だけで ordinal/total を数える', () => {
    const entries = [
      { userId: 'a' },
      { userId: 'a' },
      { userId: 'b' },
      { userId: 'a' }
    ];
    // 直近 2 件（index 2,3 = b,a）だけのウィンドウ
    const { ordinals, totals } = buildSupportAccentIndex(entries, 2, 2);
    expect(ordinals).toEqual([1, 1]);
    expect(totals).toEqual([1, 1]);
  });

  it('count が残り件数より大きくても entries 末尾で頭打ち', () => {
    const entries = [{ userId: 'a' }, { userId: 'a' }];
    const { ordinals, totals } = buildSupportAccentIndex(entries, 1, 999);
    expect(ordinals).toEqual([1]);
    expect(totals).toEqual([1]);
  });

  it('空・非配列・範囲外 offset は空配列', () => {
    expect(buildSupportAccentIndex([])).toEqual({ ordinals: [], totals: [] });
    expect(buildSupportAccentIndex(/** @type {any} */ (null))).toEqual({
      ordinals: [],
      totals: []
    });
    expect(buildSupportAccentIndex([{ userId: 'a' }], 5)).toEqual({
      ordinals: [],
      totals: []
    });
  });
});
