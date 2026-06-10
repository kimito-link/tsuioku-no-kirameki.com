import { describe, it, expect } from 'vitest';
import {
  normalizeComeviewUserNotes,
  upsertComeviewUserNote,
  comeviewAnonLabel,
  resolveComeviewDisplayName,
  formatComeviewTime,
  COMEVIEW_USER_NOTES_MAX
} from './comeviewUserNotes.js';

describe('upsertComeviewUserNote', () => {
  it('新規ニックネームを追加できる(匿名 a:… キーでも同じ)', () => {
    const out = upsertComeviewUserNote({}, 'u:a:XYZ', { nickname: '柿ピーさん' }, 100);
    expect(out['u:a:XYZ']).toEqual({ nickname: '柿ピーさん', label: '', memo: '', at: 100 });
  });
  it('patch に無いフィールドは保持される(部分更新)', () => {
    const base = { 'u:1': { nickname: 'たろう', label: '常連', memo: 'メモ', at: 1 } };
    const out = upsertComeviewUserNote(base, 'u:1', { label: '初見' }, 2);
    expect(out['u:1']).toEqual({ nickname: 'たろう', label: '初見', memo: 'メモ', at: 2 });
  });
  it('全フィールドを空にしたらエントリ削除', () => {
    const base = { 'u:1': { nickname: 'たろう', label: '', memo: '', at: 1 } };
    const out = upsertComeviewUserNote(base, 'u:1', { nickname: '' }, 2);
    expect(out['u:1']).toBeUndefined();
  });
  it('元の map は破壊しない', () => {
    const base = { 'u:1': { nickname: 'たろう', label: '', memo: '', at: 1 } };
    upsertComeviewUserNote(base, 'u:1', { nickname: 'X' }, 2);
    expect(base['u:1'].nickname).toBe('たろう');
  });
  it('キー無しは何もしない', () => {
    expect(upsertComeviewUserNote({}, '', { nickname: 'x' }, 1)).toEqual({});
  });
  it('上限超過は更新の古い順に捨てる', () => {
    let map = {};
    for (let i = 0; i < COMEVIEW_USER_NOTES_MAX + 3; i += 1) {
      map = upsertComeviewUserNote(map, `u:${i}`, { nickname: `n${i}` }, i + 1);
    }
    expect(Object.keys(map)).toHaveLength(COMEVIEW_USER_NOTES_MAX);
    expect(map['u:0']).toBeUndefined();
    expect(map['u:2']).toBeUndefined();
    expect(map[`u:${COMEVIEW_USER_NOTES_MAX + 2}`]).toBeTruthy();
  });
});

describe('normalizeComeviewUserNotes', () => {
  it('壊れた要素と空エントリを捨てる', () => {
    const out = normalizeComeviewUserNotes({
      'u:1': { nickname: 'たろう', label: '', memo: '', at: 1 },
      'u:2': { nickname: '', label: '', memo: '', at: 2 }, // 全部空=捨てる
      'u:3': 'string',
      '': { nickname: 'x' }
    });
    expect(Object.keys(out)).toEqual(['u:1']);
  });
  it('object 以外は空 map', () => {
    expect(normalizeComeviewUserNotes(null)).toEqual({});
    expect(normalizeComeviewUserNotes([1])).toEqual({});
  });
});

describe('comeviewAnonLabel', () => {
  it('a:… の匿名 ID は安定した 匿名NNN(同じ ID は常に同じ番号)', () => {
    const a = comeviewAnonLabel('a:d8KyTJKlU_rTi7sC');
    expect(a).toMatch(/^匿名\d{1,3}$/);
    expect(comeviewAnonLabel('a:d8KyTJKlU_rTi7sC')).toBe(a);
    expect(comeviewAnonLabel('a:other')).not.toBe('');
  });
  it('匿名形式でない ID には付けない', () => {
    expect(comeviewAnonLabel('41199319')).toBe('');
    expect(comeviewAnonLabel('')).toBe('');
  });
});

describe('resolveComeviewDisplayName', () => {
  const notes = { 'u:a:XYZ': { nickname: '柿ピーさん', label: '', memo: '', at: 1 } };
  it('ニックネームが最優先(匿名にもハンドルを付けられる=わんコメ式の肝)', () => {
    expect(
      resolveComeviewDisplayName({ userId: 'a:XYZ', name: '' }, notes, 'u:a:XYZ')
    ).toBe('柿ピーさん');
  });
  it('ニックネーム無しは本来の名前', () => {
    expect(
      resolveComeviewDisplayName({ userId: '1', name: 'たろう' }, notes, 'u:1')
    ).toBe('たろう');
  });
  it('名前も無い匿名は 匿名NNN にフォールバック', () => {
    const out = resolveComeviewDisplayName({ userId: 'a:other', name: '' }, {}, 'u:a:other');
    expect(out).toMatch(/^匿名\d{1,3}$/);
  });
  it('識別不能な行は空文字', () => {
    expect(resolveComeviewDisplayName({ userId: '123', name: '' }, {}, 'u:123')).toBe('');
    expect(resolveComeviewDisplayName(null, notes, '')).toBe('');
  });
});

describe('formatComeviewTime', () => {
  it('HH:MM:SS に整形する', () => {
    const d = new Date(2026, 5, 10, 9, 5, 7).getTime();
    expect(formatComeviewTime(d)).toBe('09:05:07');
  });
  it('無効値は空文字', () => {
    expect(formatComeviewTime(null)).toBe('');
    expect(formatComeviewTime(0)).toBe('');
    expect(formatComeviewTime(NaN)).toBe('');
  });
});
