import { describe, it, expect } from 'vitest';
import {
  UNKNOWN_USER_KEY,
  displayUserLabel,
  aggregateCommentsByUser
} from './userRooms.js';

describe('displayUserLabel', () => {
  it('未取得キー', () => {
    expect(displayUserLabel(UNKNOWN_USER_KEY)).toContain('ID未取得');
  });

  it('空文字は未取得扱い', () => {
    expect(displayUserLabel('')).toContain('ID未取得');
  });

  it('短いIDはそのまま', () => {
    expect(displayUserLabel('user12')).toBe('user12');
  });

  it('長いIDは省略', () => {
    expect(displayUserLabel('12345678901234567890')).toMatch(/…/);
  });

  it('ニックネームがあれば名前（ID）形式', () => {
    expect(displayUserLabel('12345', 'たろう')).toBe('たろう（12345）');
  });

  it('ニックネーム + 長いID', () => {
    const label = displayUserLabel('12345678901234567890', 'はなこ');
    expect(label).toContain('はなこ');
    expect(label).toMatch(/…/);
  });

  it('ニックネーム空ならIDのみ', () => {
    expect(displayUserLabel('12345', '')).toBe('12345');
    expect(displayUserLabel('12345', undefined)).toBe('12345');
  });
});

describe('aggregateCommentsByUser', () => {
  it('非配列は空結果', () => {
    expect(aggregateCommentsByUser(/** @type {any} */ (null))).toEqual([]);
    expect(aggregateCommentsByUser(/** @type {any} */ (undefined))).toEqual([]);
  });

  it('userId でルーム分け', () => {
    const rows = aggregateCommentsByUser([
      { userId: 'u1', text: 'a', capturedAt: 100 },
      { userId: 'u1', text: 'b', capturedAt: 200 },
      { userId: 'u2', text: 'c', capturedAt: 150 }
    ]);
    expect(rows).toHaveLength(2);
    const u1 = rows.find((r) => r.userKey === 'u1');
    expect(u1?.count).toBe(2);
    expect(u1?.lastText).toBe('b');
  });

  it('userId なしは unknown にまとめる', () => {
    const rows = aggregateCommentsByUser([
      { userId: null, text: 'x', capturedAt: 10 },
      { text: 'y', capturedAt: 20 }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].userKey).toBe(UNKNOWN_USER_KEY);
    expect(rows[0].count).toBe(2);
  });

  it('userId が空白のみなら未取得キー', () => {
    const rows = aggregateCommentsByUser([
      { userId: '   ', text: 'a', capturedAt: 1 }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].userKey).toBe(UNKNOWN_USER_KEY);
  });

  it('lastText は 60 文字で省略', () => {
    const long = 'あ'.repeat(70);
    const rows = aggregateCommentsByUser([
      { userId: 'u1', text: long, capturedAt: 100 }
    ]);
    expect(rows[0].lastText.length).toBeLessThanOrEqual(62);
    expect(rows[0].lastText).toMatch(/…$/);
  });

  it('同じ lastAt なら後勝ち（配列順の最後）', () => {
    const rows = aggregateCommentsByUser([
      { userId: 'u1', text: 'first', capturedAt: 50 },
      { userId: 'u1', text: 'second', capturedAt: 50 }
    ]);
    expect(rows[0].lastText).toBe('second');
  });

  it('nickname が集計に含まれる', () => {
    const rows = aggregateCommentsByUser([
      { userId: 'u1', nickname: 'たろう', text: 'a', capturedAt: 100 },
      { userId: 'u1', text: 'b', capturedAt: 200 }
    ]);
    expect(rows[0].nickname).toBe('たろう');
  });

  it('nickname なしは空文字', () => {
    const rows = aggregateCommentsByUser([
      { userId: 'u1', text: 'a', capturedAt: 100 }
    ]);
    expect(rows[0].nickname).toBe('');
  });
});
