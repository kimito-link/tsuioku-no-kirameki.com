import { describe, it, expect } from 'vitest';
import {
  normalizeCommentText,
  buildDedupeKey,
  createCommentEntry,
  mergeNewComments
} from './commentRecord.js';
import { commentsStorageKey } from './storageKeys.js';

describe('normalizeCommentText', () => {
  it('前後空白と改行を整える', () => {
    expect(normalizeCommentText('  a\nb  ')).toBe('a\nb');
  });

  it('空は空文字', () => {
    expect(normalizeCommentText('   ')).toBe('');
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
});

describe('commentsStorageKey', () => {
  it('小文字化', () => {
    expect(commentsStorageKey('LV123')).toBe('nls_comments_lv123');
  });
});
