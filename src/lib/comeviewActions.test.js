import { describe, it, expect } from 'vitest';
import {
  comeviewUserKeyForRow,
  buildComeviewCopyText,
  normalizeComeviewNgList,
  addComeviewNgEntry,
  removeComeviewNgEntry,
  isComeviewRowHidden,
  extractUserCommentRows,
  comeviewPinStorageKey,
  COMEVIEW_NG_MAX
} from './comeviewActions.js';

describe('comeviewUserKeyForRow', () => {
  it('userId があれば u: キー', () => {
    expect(comeviewUserKeyForRow({ userId: '12345', name: 'たろう' })).toBe('u:12345');
  });
  it('userId が無ければ名前で代替(匿名コメ対策)', () => {
    expect(comeviewUserKeyForRow({ userId: '', name: 'たろう' })).toBe('n:たろう');
  });
  it('どちらも無い行は識別不能で空文字', () => {
    expect(comeviewUserKeyForRow({ userId: '', name: '' })).toBe('');
    expect(comeviewUserKeyForRow(null)).toBe('');
  });
});

describe('buildComeviewCopyText', () => {
  it('名前があれば「名前: 本文」', () => {
    expect(buildComeviewCopyText({ name: 'たろう', text: 'こんにちは' })).toBe(
      'たろう: こんにちは'
    );
  });
  it('名前が無ければ本文だけ', () => {
    expect(buildComeviewCopyText({ name: '', text: 'こんにちは' })).toBe('こんにちは');
  });
  it('本文が無ければ空文字', () => {
    expect(buildComeviewCopyText({ name: 'たろう', text: '' })).toBe('');
    expect(buildComeviewCopyText(null)).toBe('');
  });
});

describe('NG リスト(追加/解除/正規化)', () => {
  it('追加は冪等(同じユーザーを二重に入れない)', () => {
    const a = addComeviewNgEntry([], { userId: '1', name: 'たろう' }, 100);
    expect(a.added).toBe(true);
    expect(a.key).toBe('u:1');
    const b = addComeviewNgEntry(a.list, { userId: '1', name: 'たろう' }, 200);
    expect(b.added).toBe(false);
    expect(b.list).toHaveLength(1);
  });
  it('識別不能な行は追加されない', () => {
    const a = addComeviewNgEntry([], { userId: '', name: '' }, 100);
    expect(a.added).toBe(false);
    expect(a.list).toHaveLength(0);
  });
  it('解除で消える', () => {
    const a = addComeviewNgEntry([], { userId: '1', name: 'たろう' }, 100);
    expect(removeComeviewNgEntry(a.list, 'u:1')).toHaveLength(0);
  });
  it('上限を超えたら古い順に捨てる', () => {
    let list = [];
    for (let i = 0; i < COMEVIEW_NG_MAX + 5; i += 1) {
      list = addComeviewNgEntry(list, { userId: String(i), name: '' }, i).list;
    }
    expect(list).toHaveLength(COMEVIEW_NG_MAX);
    expect(list[0].key).toBe('u:5');
  });
  it('normalize は壊れた要素と重複を捨てる', () => {
    const out = normalizeComeviewNgList([
      { key: 'u:1', name: 'a', at: 1 },
      { key: 'u:1', name: 'dupe', at: 2 },
      { name: 'キー無し' },
      'string',
      null,
      { key: 'n:たろう', name: 'たろう', at: 3 }
    ]);
    expect(out.map((e) => e.key)).toEqual(['u:1', 'n:たろう']);
  });
  it('normalize は配列以外を空にする', () => {
    expect(normalizeComeviewNgList(undefined)).toEqual([]);
    expect(normalizeComeviewNgList({})).toEqual([]);
  });
});

describe('isComeviewRowHidden', () => {
  const ng = new Set(['u:1']);
  const hidden = new Set(['no:7']);
  it('NG ユーザーの行は隠す', () => {
    expect(isComeviewRowHidden({ id: 'no:9', userId: '1', name: 'x' }, ng, hidden)).toBe(true);
  });
  it('行単位の非表示 id は隠す', () => {
    expect(isComeviewRowHidden({ id: 'no:7', userId: '2', name: 'y' }, ng, hidden)).toBe(true);
  });
  it('どちらにも該当しなければ表示', () => {
    expect(isComeviewRowHidden({ id: 'no:9', userId: '2', name: 'y' }, ng, hidden)).toBe(false);
  });
});

describe('extractUserCommentRows(追憶独自: この人の発言だけ)', () => {
  const archive = [
    { commentNo: 1, text: 'あ', userId: '1', name: 'たろう' },
    { commentNo: 2, text: 'い', userId: '2', name: 'じろう' },
    { commentNo: 3, text: 'う', userId: '1', name: 'たろう' },
    { commentNo: 4, text: '', userId: '1', name: 'たろう' }, // 空本文は除外
    { commentNo: 5, text: 'え', userId: '', name: 'たろう' } // userId 無し=別キー
  ];
  it('userId キーで本人の発言だけ昇順に取り出す', () => {
    const { rows, total } = extractUserCommentRows(archive, 'u:1');
    expect(total).toBe(2);
    expect(rows.map((r) => r.text)).toEqual(['あ', 'う']);
  });
  it('名前キー(匿名)はそのキーの行だけ', () => {
    const { rows, total } = extractUserCommentRows(archive, 'n:たろう');
    expect(total).toBe(1);
    expect(rows[0].text).toBe('え');
  });
  it('max を超える分は total に数えつつ末尾だけ返す', () => {
    const many = [];
    for (let i = 0; i < 10; i += 1) {
      many.push({ commentNo: i + 1, text: `c${i}`, userId: '1', name: 'たろう' });
    }
    const { rows, total } = extractUserCommentRows(many, 'u:1', 3);
    expect(total).toBe(10);
    expect(rows.map((r) => r.text)).toEqual(['c7', 'c8', 'c9']);
  });
  it('無効入力は空', () => {
    expect(extractUserCommentRows(null, 'u:1')).toEqual({ rows: [], total: 0 });
    expect(extractUserCommentRows(archive, '')).toEqual({ rows: [], total: 0 });
  });
});

describe('comeviewPinStorageKey', () => {
  it('lv を正規化してキー化', () => {
    expect(comeviewPinStorageKey(' LV123 ')).toBe('nls_comeview_pin_lv123');
  });
});
