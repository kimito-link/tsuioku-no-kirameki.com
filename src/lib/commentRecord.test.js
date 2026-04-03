import { describe, it, expect } from 'vitest';
import {
  normalizeCommentText,
  buildDedupeKey,
  createCommentEntry,
  mergeNewComments
} from './commentRecord.js';

describe('normalizeCommentText', () => {
  it('前後空白と改行を整える', () => {
    expect(normalizeCommentText('  a\nb  ')).toBe('a\nb');
  });

  it('空は空文字', () => {
    expect(normalizeCommentText('   ')).toBe('');
  });

  it('null / undefined は空文字', () => {
    expect(normalizeCommentText(/** @type {any} */ (null))).toBe('');
    expect(normalizeCommentText(/** @type {any} */ (undefined))).toBe('');
  });
});

describe('buildDedupeKey', () => {
  it('番号ありは liveId|no|text', () => {
    expect(
      buildDedupeKey('lv1', {
        commentNo: '1011',
        text: 'hello',
        capturedAt: 1_700_000_000_000
      })
    ).toBe('lv1|1011|hello');
  });

  it('番号なしは capturedAt を秒単位で含める', () => {
    expect(
      buildDedupeKey('lv1', {
        commentNo: '',
        text: 'hello',
        capturedAt: 1_700_000_000_123
      })
    ).toBe('lv1||hello|1700000000');
  });

  it('同一秒・同一本文・番号なしは同じキー', () => {
    const row = { commentNo: '', text: 'x', capturedAt: 5_000 };
    expect(buildDedupeKey('lv1', row)).toBe(buildDedupeKey('lv1', row));
  });
});

describe('createCommentEntry', () => {
  it('id と capturedAt を付与', () => {
    const e = createCommentEntry({
      liveId: 'lv9',
      commentNo: '1',
      text: 'x',
      userId: null
    });
    expect(e.liveId).toBe('lv9');
    expect(e.commentNo).toBe('1');
    expect(e.text).toBe('x');
    expect(typeof e.id).toBe('string');
    expect(e.id.length).toBeGreaterThan(4);
    expect(typeof e.capturedAt).toBe('number');
  });

  it('liveId は小文字化', () => {
    const e = createCommentEntry({
      liveId: 'LV88',
      commentNo: '1',
      text: 'a',
      userId: null
    });
    expect(e.liveId).toBe('lv88');
  });
});

describe('mergeNewComments', () => {
  it('新規だけ追加し dedupe する', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null
      })
    ];
    const firstId = existing[0].id;
    const incoming = [
      { commentNo: '1', text: 'a', userId: null },
      { commentNo: '2', text: 'b', userId: 'u1' }
    ];
    const { next, added } = mergeNewComments('lv1', existing, incoming);
    expect(added).toHaveLength(1);
    expect(added[0].commentNo).toBe('2');
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(firstId);
  });

  it('liveId 引数の大文字小文字を正規化', () => {
    const { added, next } = mergeNewComments('LV1', [], [
      { commentNo: '1', text: 'x', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].liveId).toBe('lv1');
    expect(next[0].liveId).toBe('lv1');
  });

  it('incoming が空なら added も空', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null
      })
    ];
    const { next, added } = mergeNewComments('lv1', existing, []);
    expect(added).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('本文が空の incoming はスキップ', () => {
    const { added, next } = mergeNewComments('lv1', [], [
      { commentNo: '1', text: '   ', userId: null },
      { commentNo: '2', text: 'ok', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].commentNo).toBe('2');
    expect(next).toHaveLength(1);
  });

  it('同じ番号でも本文が違えば別エントリ', () => {
    const { added, next } = mergeNewComments('lv1', [], [
      { commentNo: '5', text: 'first', userId: null },
      { commentNo: '5', text: 'second', userId: null }
    ]);
    expect(added).toHaveLength(2);
    expect(next.map((r) => r.text)).toEqual(['first', 'second']);
  });

  it('existing が欠損フィールドでも落ちない', () => {
    const existing = /** @type {any[]} */ ([{ commentNo: '1', text: 'old' }]);
    const { next, added } = mergeNewComments('lv1', existing, [
      { commentNo: '2', text: 'new', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(next.length).toBeGreaterThanOrEqual(2);
  });
});
