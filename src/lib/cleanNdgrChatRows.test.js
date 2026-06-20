import { describe, it, expect } from 'vitest';
import { cleanNdgrChatRows } from './cleanNdgrChatRows.js';

describe('cleanNdgrChatRows', () => {
  it('正常な行を返す', () => {
    const rows = [{ commentNo: '1', text: 'hello', userId: 'u1' }];
    const result = cleanNdgrChatRows(rows);
    expect(result).toEqual([{ commentNo: '1', text: 'hello', userId: 'u1' }]);
  });

  // v0.1.836 匿名(184)救済: 番号無しでも「本文+識別子」があれば受理に変更。
  it('commentNo 無し + 本文 + 識別子(userId) → 受理する(匿名救済)', () => {
    const rows = [
      { commentNo: '1', text: 'ok', userId: 'u1' },
      { commentNo: '', text: 'anon hello', userId: 'a:hashed1' },
      { commentNo: '  ', text: 'anon hi', userId: 'a:hashed2' }
    ];
    // 旧挙動は「番号無しは全捨て=1件」だったが、匿名本文を救うため3件すべて通す。
    expect(cleanNdgrChatRows(rows)).toHaveLength(3);
  });

  it('commentNo 無し + 識別子無し → 捨てる(身元ゼロは受理しない)', () => {
    const rows = [{ commentNo: '', text: 'no id', userId: '' }];
    expect(cleanNdgrChatRows(rows)).toHaveLength(0);
  });

  it('commentNo 無し + 識別子あり + 本文空 → 捨てる(本文必須)', () => {
    const rows = [{ commentNo: '', text: '   ', userId: 'a:hashed1' }];
    expect(cleanNdgrChatRows(rows)).toHaveLength(0);
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
