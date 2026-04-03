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

  it('長いIDは省略', () => {
    expect(displayUserLabel('12345678901234567890')).toMatch(/…/);
  });
});

describe('aggregateCommentsByUser', () => {
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
});
