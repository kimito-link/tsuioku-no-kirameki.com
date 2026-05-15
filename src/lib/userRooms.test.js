import { describe, it, expect } from 'vitest';
import {
  UNKNOWN_USER_KEY,
  displayUserLabel,
  shortUserKeyDisplay,
  aggregateCommentsByUser
} from './userRooms.js';

describe('shortUserKeyDisplay', () => {
  it('未取得・空は空', () => {
    expect(shortUserKeyDisplay('')).toBe('');
    expect(shortUserKeyDisplay(UNKNOWN_USER_KEY)).toBe('');
  });

  it('短いIDはそのまま', () => {
    expect(shortUserKeyDisplay('user12')).toBe('user12');
  });

  it('長いIDは省略', () => {
    expect(shortUserKeyDisplay('12345678901234567890')).toMatch(/…/);
  });
});

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
  expect(displayUserLabel('a:ab', '')).toBe('匿名（a:ab）');
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

  it('avatarUrl は最新 capturedAt のコメントのもの（http/https のみ）', () => {
    const rows = aggregateCommentsByUser([
      {
        userId: 'u1',
        text: 'old',
        capturedAt: 100,
        avatarUrl: 'https://example.com/a.png'
      },
      {
        userId: 'u1',
        text: 'new',
        capturedAt: 200,
        avatarUrl: 'https://example.com/b.png'
      }
    ]);
    expect(rows[0].avatarUrl).toBe('https://example.com/b.png');
  });

  it('avatarUrl が不正なら空、最新行も不正なら空のまま', () => {
    const rows = aggregateCommentsByUser([
      {
        userId: 'u1',
        text: 'a',
        capturedAt: 100,
        avatarUrl: 'javascript:alert(1)'
      },
      { userId: 'u1', text: 'b', capturedAt: 200, avatarUrl: '' }
    ]);
    expect(rows[0].avatarUrl).toBe('');
  });

  it('最新コメントに avatar が無くても、過去の有効 avatarUrl は消さない', () => {
    const rows = aggregateCommentsByUser([
      {
        userId: 'u1',
        text: 'old',
        capturedAt: 100,
        avatarUrl: 'https://example.com/a.png'
      },
      { userId: 'u1', text: 'new', capturedAt: 200, avatarUrl: '' }
    ]);
    expect(rows[0].lastText).toBe('new');
    expect(rows[0].avatarUrl).toBe('https://example.com/a.png');
  });

  it('ID未取得ルームも avatarUrl キーは空文字', () => {
    const rows = aggregateCommentsByUser([
      { text: 'x', capturedAt: 10, avatarUrl: 'https://example.com/x.png' }
    ]);
    expect(rows[0].userKey).toBe(UNKNOWN_USER_KEY);
    expect(rows[0].avatarUrl).toBe('');
  });

  it('requireText: true で text 空の entry を除外（ギフト送信のみのユーザーが消える）', () => {
    const rows = aggregateCommentsByUser(
      [
        { userId: 'commenter', text: 'こんにちは', capturedAt: 100 },
        { userId: 'commenter', text: 'ww', capturedAt: 200 },
        { userId: 'gift_only_user', text: '', capturedAt: 300 },
        { userId: 'mixed', text: '', capturedAt: 400 },
        { userId: 'mixed', text: '応援！', capturedAt: 500 },
        { userId: 'whitespace_only', text: '   ', capturedAt: 600 }
      ],
      { requireText: true }
    );
    const keys = rows.map((r) => r.userKey).sort();
    expect(keys).toEqual(['commenter', 'mixed']);
    const commenter = rows.find((r) => r.userKey === 'commenter');
    expect(commenter?.count).toBe(2);
    const mixed = rows.find((r) => r.userKey === 'mixed');
    expect(mixed?.count).toBe(1); // 空 text の entry はカウントされない
  });

  it('requireText: true ではおすすめユーザー誤抽出行（ID / u/ID のみ）を除外', () => {
    const rows = aggregateCommentsByUser(
      [
        { userId: '137814833', text: '137814833', capturedAt: 100 },
        { userId: '137814833', text: 'u/137814833', capturedAt: 200 },
        { userId: '99999999', text: '普通のコメント', capturedAt: 300 }
      ],
      { requireText: true }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userKey).toBe('99999999');
  });

  it('requireText 未指定（旧 API）では従来どおり全 entry をカウント', () => {
    const rowsDefault = aggregateCommentsByUser([
      { userId: 'gift_only', text: '', capturedAt: 100 }
    ]);
    expect(rowsDefault.length).toBe(1);
    expect(rowsDefault[0].userKey).toBe('gift_only');
  });
});
