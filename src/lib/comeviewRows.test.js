import { describe, it, expect } from 'vitest';
import {
  COMEVIEW_MAX_ROWS,
  normalizeComeviewRow,
  buildComeviewRows,
  pickNewComeviewRows,
  dedupeWeakComeviewRows,
  isGenericComeviewName
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

describe('dedupeWeakComeviewRows(別ソース二重表示の除去)', () => {
  it('no 無し行は、同じ本文の no 付き行が±15秒以内にあれば重複として捨てる', () => {
    const rows = [
      { id: 'no:325', no: 325, name: '', text: '友蔵', userId: 'a:X', avatar: '', selfPosted: false, capturedAt: 1000 },
      { id: 'c::友蔵:3000', no: null, name: '匿名', text: '友蔵', userId: '', avatar: '', selfPosted: false, capturedAt: 3000 }
    ];
    const out = dedupeWeakComeviewRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].no).toBe(325);
  });
  it('時刻不明の no 無し行も同文 no 付きがあれば重複扱い', () => {
    const rows = [
      { id: 'no:1', no: 1, name: '', text: 'あ', userId: 'a:X', avatar: '', selfPosted: false, capturedAt: null },
      { id: 'c::あ:', no: null, name: '', text: 'あ', userId: '', avatar: '', selfPosted: false, capturedAt: null }
    ];
    expect(dedupeWeakComeviewRows(rows)).toHaveLength(1);
  });
  it('no 付き同士のエコーコメント(別人の同文)は両方残す', () => {
    const rows = [
      { id: 'no:1', no: 1, name: '', text: 'www', userId: 'a:X', avatar: '', selfPosted: false, capturedAt: 1000 },
      { id: 'no:2', no: 2, name: '', text: 'www', userId: 'a:Y', avatar: '', selfPosted: false, capturedAt: 2000 }
    ];
    expect(dedupeWeakComeviewRows(rows)).toHaveLength(2);
  });
  it('素性なし(名前もIDも無い)弱い行は、同文の素性あり行が近くにあれば捨てる', () => {
    const rows = [
      { id: 'c:a1:こんにちは:1000', no: null, name: 'ほねと', text: 'こんにちは', userId: 'a:1', avatar: '', selfPosted: false, capturedAt: 1000 },
      { id: 'c::こんにちは:2000', no: null, name: '', text: 'こんにちは', userId: '', avatar: '', selfPosted: false, capturedAt: 2000 }
    ];
    const out = dedupeWeakComeviewRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('ほねと');
  });
  it('素性あり同士の同文(別人のエコー)は両方残す', () => {
    const rows = [
      { id: 'c:a1:わこつ:1000', no: null, name: 'A', text: 'わこつ', userId: 'a:1', avatar: '', selfPosted: false, capturedAt: 1000 },
      { id: 'c:a2:わこつ:2000', no: null, name: 'B', text: 'わこつ', userId: 'a:2', avatar: '', selfPosted: false, capturedAt: 2000 }
    ];
    expect(dedupeWeakComeviewRows(rows)).toHaveLength(2);
  });
  it('同一人物(同uid)の同文 weak 行は最初の1件だけ残す(recent/tail の時刻ズレ二重取り)', () => {
    const rows = [
      { id: 'c:a513:くちばし:1000', no: null, name: '', text: 'くちばし', userId: 'a:513', avatar: '', selfPosted: false, capturedAt: 1000 },
      { id: 'c:a513:くちばし:4000', no: null, name: '', text: 'くちばし', userId: 'a:513', avatar: '', selfPosted: false, capturedAt: 4000 }
    ];
    const out = dedupeWeakComeviewRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].capturedAt).toBe(1000);
  });
  it('素性なし行どうしだけなら残す(重複と断定する材料がない)', () => {
    const rows = [
      { id: 'c::おはよう:1000', no: null, name: '', text: 'おはよう', userId: '', avatar: '', selfPosted: false, capturedAt: 1000 },
      { id: 'c::おはよう:2000', no: null, name: '', text: 'おはよう', userId: '', avatar: '', selfPosted: false, capturedAt: 2000 }
    ];
    expect(dedupeWeakComeviewRows(rows)).toHaveLength(2);
  });
  it('同文でも15秒より離れていれば別コメントとして残す', () => {
    const rows = [
      { id: 'no:1', no: 1, name: '', text: 'こん', userId: 'a:X', avatar: '', selfPosted: false, capturedAt: 1000 },
      { id: 'c::こん:60000', no: null, name: '', text: 'こん', userId: '', avatar: '', selfPosted: false, capturedAt: 60000 }
    ];
    expect(dedupeWeakComeviewRows(rows)).toHaveLength(2);
  });
});

describe('isGenericComeviewName', () => {
  it('匿名/名無しは汎用名', () => {
    expect(isGenericComeviewName('匿名')).toBe(true);
    expect(isGenericComeviewName(' 名無し ')).toBe(true);
  });
  it('個人名は汎用名でない', () => {
    expect(isGenericComeviewName('たろう')).toBe(false);
    expect(isGenericComeviewName('')).toBe(false);
  });
});
