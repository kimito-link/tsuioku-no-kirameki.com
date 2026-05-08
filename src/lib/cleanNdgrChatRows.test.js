import { describe, it, expect } from 'vitest';
import { cleanNdgrChatRows } from './cleanNdgrChatRows.js';

describe('cleanNdgrChatRows', () => {
  it('正常な行を返す', () => {
    const rows = [{ commentNo: '1', text: 'hello', userId: 'u1' }];
    const result = cleanNdgrChatRows(rows);
    expect(result).toEqual([{ commentNo: '1', text: 'hello', userId: 'u1' }]);
  });

  it('commentNo が空の行を除外', () => {
    const rows = [
      { commentNo: '1', text: 'ok', userId: 'u1' },
      { commentNo: '', text: 'skip', userId: 'u2' },
      { commentNo: '  ', text: 'skip2', userId: 'u3' }
    ];
    expect(cleanNdgrChatRows(rows)).toHaveLength(1);
  });

  it('null / undefined を含む配列からスキップ', () => {
    const rows = [null, undefined, { commentNo: '1', text: 'ok' }];
    expect(cleanNdgrChatRows(rows)).toHaveLength(1);
  });

  it('userId が空文字なら null になる', () => {
    const rows = [{ commentNo: '1', text: 'hi', userId: '' }];
    expect(cleanNdgrChatRows(rows)[0].userId).toBeNull();
  });

  it('nickname があれば含まれる', () => {
    const rows = [{ commentNo: '1', text: 'hi', userId: 'u1', nickname: 'Bob' }];
    expect(cleanNdgrChatRows(rows)[0].nickname).toBe('Bob');
  });

  it('nickname が空なら省略', () => {
    const rows = [{ commentNo: '1', text: 'hi', userId: 'u1', nickname: '' }];
    expect(cleanNdgrChatRows(rows)[0]).not.toHaveProperty('nickname');
  });

  it('vpos があれば含まれる', () => {
    const rows = [{ commentNo: '1', text: 'hi', userId: null, vpos: 100 }];
    expect(cleanNdgrChatRows(rows)[0].vpos).toBe(100);
  });

  it('accountStatus があれば含まれる', () => {
    const rows = [{ commentNo: '1', text: 'hi', userId: null, accountStatus: 1 }];
    expect(cleanNdgrChatRows(rows)[0].accountStatus).toBe(1);
  });

  it('is184 が true なら含まれる', () => {
    const rows = [{ commentNo: '1', text: 'hi', userId: null, is184: true }];
    expect(cleanNdgrChatRows(rows)[0].is184).toBe(true);
  });

  it('is184 が false なら省略', () => {
    const rows = [{ commentNo: '1', text: 'hi', userId: null, is184: false }];
    expect(cleanNdgrChatRows(rows)[0]).not.toHaveProperty('is184');
  });

  it('空配列 → 空配列', () => {
    expect(cleanNdgrChatRows([])).toEqual([]);
  });

  // v0.1.195: NDGR ギフトシステムメッセージは通常コメントとして persist しない
  // （非コメユーザーが「ユーザー別応援件数」に混入する真因 fix）
  it('ギフトシステムメッセージ行を除外する', () => {
    const raw = [
      { commentNo: '1', text: 'こんにちは', userId: 'u1' },
      {
        commentNo: '2',
        text: 'ポンコツびぃちゃんさんがギフト「応援メガホン 黄（10pt）」を贈りました',
        userId: '123514112'
      },
      { commentNo: '3', text: 'おつ〜', userId: 'u3' }
    ];
    const cleaned = cleanNdgrChatRows(raw);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].text).toBe('こんにちは');
    expect(cleaned[1].text).toBe('おつ〜');
  });

  it('「【ギフト貢献N位】XXX さんがギフト〜」も除外する', () => {
    const raw = [
      {
        commentNo: '1',
        text: '【ギフト貢献5位】kawarimiw9 さんがギフト「ヤミーアイスクリーム（100pt）」を贈りました',
        userId: '13891348'
      }
    ];
    const cleaned = cleanNdgrChatRows(raw);
    expect(cleaned).toHaveLength(0);
  });

  it('通常コメは text 内に「ギフト」を含んでも persist する', () => {
    const raw = [
      { commentNo: '1', text: 'ギフトありがとう！', userId: 'u1' }
    ];
    const cleaned = cleanNdgrChatRows(raw);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].text).toBe('ギフトありがとう！');
  });
});
