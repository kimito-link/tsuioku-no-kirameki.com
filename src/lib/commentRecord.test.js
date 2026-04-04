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
    const { next, added, storageTouched } = mergeNewComments(
      'lv1',
      existing,
      incoming
    );
    expect(added).toHaveLength(1);
    expect(added[0].commentNo).toBe('2');
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(firstId);
    expect(storageTouched).toBe(true);
  });

  it('liveId 引数の大文字小文字を正規化', () => {
    const { added, next, storageTouched } = mergeNewComments('LV1', [], [
      { commentNo: '1', text: 'x', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].liveId).toBe('lv1');
    expect(next[0].liveId).toBe('lv1');
    expect(storageTouched).toBe(true);
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
    const { next, added, storageTouched } = mergeNewComments(
      'lv1',
      existing,
      []
    );
    expect(added).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(storageTouched).toBe(false);
  });

  it('本文が空の incoming はスキップ', () => {
    const { added, next, storageTouched } = mergeNewComments('lv1', [], [
      { commentNo: '1', text: '   ', userId: null },
      { commentNo: '2', text: 'ok', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].commentNo).toBe('2');
    expect(next).toHaveLength(1);
    expect(storageTouched).toBe(true);
  });

  it('同じ番号でも本文が違えば別エントリ', () => {
    const { added, next, storageTouched } = mergeNewComments('lv1', [], [
      { commentNo: '5', text: 'first', userId: null },
      { commentNo: '5', text: 'second', userId: null }
    ]);
    expect(added).toHaveLength(2);
    expect(next.map((r) => r.text)).toEqual(['first', 'second']);
    expect(storageTouched).toBe(true);
  });

  it('existing が欠損フィールドでも落ちない', () => {
    const existing = /** @type {any[]} */ ([{ commentNo: '1', text: 'old' }]);
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '2', text: 'new', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(next.length).toBeGreaterThanOrEqual(2);
    expect(storageTouched).toBe(true);
  });

  it('重複行に avatarUrl を後付けし storageTouched のみ（added は 0）', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null
      })
    ];
    const firstId = existing[0].id;
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      {
        commentNo: '1',
        text: 'a',
        userId: null,
        avatarUrl: 'https://cdn.example/u/1.jpg'
      }
    ]);
    expect(added).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(firstId);
    expect(next[0].avatarUrl).toBe('https://cdn.example/u/1.jpg');
    expect(storageTouched).toBe(true);
  });

  it('既に avatarUrl がある重複は上書きしない', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null,
        avatarUrl: 'https://cdn.example/first.jpg'
      })
    ];
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      {
        commentNo: '1',
        text: 'a',
        userId: null,
        avatarUrl: 'https://cdn.example/second.jpg'
      }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].avatarUrl).toBe('https://cdn.example/first.jpg');
    expect(storageTouched).toBe(false);
  });

  it('新規行は有効な avatarUrl を保存', () => {
    const { added, next } = mergeNewComments('lv1', [], [
      {
        commentNo: '9',
        text: 'hi',
        userId: 'u1',
        avatarUrl: 'https://x.test/i.png'
      }
    ]);
    expect(added[0].avatarUrl).toBe('https://x.test/i.png');
    expect(next[0].avatarUrl).toBe('https://x.test/i.png');
  });

  it('無効な avatarUrl は無視', () => {
    const { added } = mergeNewComments('lv1', [], [
      { commentNo: '1', text: 'x', userId: null, avatarUrl: '/rel.png' }
    ]);
    expect(added[0].avatarUrl).toBeUndefined();
  });

  it('仮想スクロール等で先に ID なしで入った行に、同一キーで userId を後追い（added は増えない）', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '77',
        text: 'hello',
        userId: null
      })
    ];
    const firstId = existing[0].id;
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '77', text: 'hello', userId: '12345' }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].id).toBe(firstId);
    expect(next[0].userId).toBe('12345');
    expect(storageTouched).toBe(true);
  });

  it('既に userId がある重複行は上書きしない', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: '999'
      })
    ];
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '1', text: 'a', userId: '000' }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].userId).toBe('999');
    expect(storageTouched).toBe(false);
  });

  it('nickname だけ欠けている重複行に後追い', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '2',
        text: 'b',
        userId: 'u1'
      })
    ];
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '2', text: 'b', userId: 'u1', nickname: '表示名' }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].nickname).toBe('表示名');
    expect(storageTouched).toBe(true);
  });
});
