import { describe, it, expect } from 'vitest';
import {
  COMEVIEW_MAX_ROWS,
  normalizeComeviewRow,
  buildComeviewRows,
  pickNewComeviewRows,
} from './comeviewRows.js';

describe('normalizeComeviewRow', () => {
  it('生行を表示用フィールドへ正規化', () => {
    const r = normalizeComeviewRow({
      commentNo: 42,
      text: ' こんばんは ',
      userId: 'u1',
      name: 'りんく',
      avatar: 'http://x/a.png',
      selfPosted: true,
      capturedAt: 1000,
    });
    expect(r).toEqual({
      id: 'no:42',
      no: 42,
      name: 'りんく',
      text: 'こんばんは',
      userId: 'u1',
      avatar: 'http://x/a.png',
      selfPosted: true,
      capturedAt: 1000,
    });
  });
  it('nickname/avatarUrl も拾う', () => {
    const r = normalizeComeviewRow({ no: 1, text: 'a', nickname: 'こん太', avatarUrl: 'u' });
    expect(r.name).toBe('こん太');
    expect(r.avatar).toBe('u');
  });
  it('空テキストは null(表示しない)', () => {
    expect(normalizeComeviewRow({ no: 1, text: '   ' })).toBeNull();
    expect(normalizeComeviewRow({ no: 1 })).toBeNull();
    expect(normalizeComeviewRow(null)).toBeNull();
  });
  it('commentNo無しは id→合成キーの順でユニークキー', () => {
    expect(normalizeComeviewRow({ text: 'a', id: 'X' }).id).toBe('id:X');
    expect(normalizeComeviewRow({ text: 'a', userId: 'u', capturedAt: 5 }).id).toBe('c:u:a:5');
  });
});

describe('buildComeviewRows', () => {
  it('無効行を除き表示行に変換', () => {
    const rows = buildComeviewRows([
      { no: 1, text: 'a' },
      { no: 2, text: '  ' }, // 除外
      { no: 3, text: 'c' },
    ]);
    expect(rows.map((r) => r.no)).toEqual([1, 3]);
  });
  it('最新 max 件(末尾)に cap', () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ no: i, text: `c${i}` }));
    const rows = buildComeviewRows(big, 50);
    expect(rows.length).toBe(50);
    expect(rows[0].no).toBe(50); // 末尾50件=50..99
    expect(rows[49].no).toBe(99);
  });
  it('既定 cap は COMEVIEW_MAX_ROWS', () => {
    const big = Array.from({ length: 200 }, (_, i) => ({ no: i, text: 'x' }));
    expect(buildComeviewRows(big).length).toBe(COMEVIEW_MAX_ROWS);
  });
  it('配列でなければ空', () => {
    expect(buildComeviewRows(null)).toEqual([]);
  });
});

describe('pickNewComeviewRows', () => {
  it('未表示の新着だけ返す(全消し再構築しない)', () => {
    const rows = buildComeviewRows([
      { no: 1, text: 'a' },
      { no: 2, text: 'b' },
      { no: 3, text: 'c' },
    ]);
    const seen = new Set(['no:1', 'no:2']);
    const fresh = pickNewComeviewRows(rows, seen);
    expect(fresh.map((r) => r.no)).toEqual([3]);
  });
  it('seen が Set でなくても落ちない(全件 fresh)', () => {
    const rows = buildComeviewRows([{ no: 1, text: 'a' }]);
    expect(pickNewComeviewRows(rows, null).map((r) => r.no)).toEqual([1]);
  });
  it('全部既出なら空', () => {
    const rows = buildComeviewRows([{ no: 1, text: 'a' }]);
    expect(pickNewComeviewRows(rows, new Set(['no:1']))).toEqual([]);
  });
});
