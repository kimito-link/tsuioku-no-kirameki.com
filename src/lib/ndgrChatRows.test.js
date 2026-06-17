import { describe, it, expect } from 'vitest';
import { ndgrChatsToMergeRows } from './ndgrChatRows.js';

describe('ndgrChatsToMergeRows', () => {
  it('raw_user_id と本文・番号で行を返す', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 42,
        rawUserId: 86255751,
        hashedUserId: '',
        name: 'なまえ',
        content: 'こんにちは'
      }
    ]);
    expect(rows).toEqual([
      {
        commentNo: '42',
        text: 'こんにちは',
        userId: '86255751',
        nickname: 'なまえ'
      }
    ]);
  });

  it('hashed_user_id のみでも行を返す', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 99,
        rawUserId: null,
        hashedUserId: 'abc123def456',
        name: '',
        content: 'test'
      }
    ]);
    expect(rows).toEqual([
      { commentNo: '99', text: 'test', userId: 'abc123def456' }
    ]);
  });

  it('rawUserId を数値 0 のときは hashed にフォールバック', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 1,
        rawUserId: 0,
        hashedUserId: 'hashonly',
        name: '',
        content: 'x'
      }
    ]);
    expect(rows).toEqual([{ commentNo: '1', text: 'x', userId: 'hashonly' }]);
  });

  // v0.1.803(星野ロミ式最大化): no(コメント番号)が無くても content があれば採用。
  //   匿名(184)コメントを捨てずレーンへ活かす。commentNo は空文字で返す。
  it('no が null でも content があれば userId 付きで採用(commentNo 空)', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: null,
        rawUserId: 86255751,
        hashedUserId: '',
        name: '',
        content: 'こんにちは'
      }
    ]);
    expect(rows).toEqual([
      { commentNo: '', text: 'こんにちは', userId: '86255751' }
    ]);
  });

  it('no が null・hashedUserId のみでも採用(184想定・nickname 匿名)', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: null,
        rawUserId: 'a:AXaKZ_4ShxQHJVsX',
        hashedUserId: '',
        name: '',
        content: 'やっほー',
        is184: true
      }
    ]);
    expect(rows).toEqual([
      {
        commentNo: '',
        text: 'やっほー',
        userId: 'a:AXaKZ_4ShxQHJVsX',
        nickname: '匿名',
        is184: true
      }
    ]);
  });

  it('no が null かつ content も空なら採用しない(偽陽性抑止)', () => {
    expect(
      ndgrChatsToMergeRows([
        {
          no: null,
          rawUserId: 1,
          hashedUserId: '',
          name: '',
          content: '   \n  '
        }
      ])
    ).toEqual([]);
  });

  it('本文が空（正規化後）のチャットは除外', () => {
    expect(
      ndgrChatsToMergeRows([
        {
          no: 1,
          rawUserId: 1,
          hashedUserId: '',
          name: '',
          content: '   \n  '
        }
      ])
    ).toEqual([]);
  });

  it('ユーザー ID が無いチャットも番号・本文があれば userId null で返す', () => {
    expect(
      ndgrChatsToMergeRows([
        {
          no: 5,
          rawUserId: null,
          hashedUserId: '',
          name: '',
          content: 'orphan'
        }
      ])
    ).toEqual([{ commentNo: '5', text: 'orphan', userId: null }]);
  });

  it('デコード欠損（undefined フィールド）でも番号・rawUserId・本文が取れれば行を返す', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 12,
        rawUserId: 777001,
        hashedUserId: undefined,
        name: undefined,
        content: 'ndgr partial payload'
      }
    ]);
    expect(rows).toEqual([
      {
        commentNo: '12',
        text: 'ndgr partial payload',
        userId: '777001'
      }
    ]);
  });

  it('nickname は空なら付けない', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 7,
        rawUserId: 123,
        hashedUserId: '',
        name: '  ',
        content: 'hello'
      }
    ]);
    expect(rows).toEqual([{ commentNo: '7', text: 'hello', userId: '123' }]);
  });

  it('匿名ID（a:）で name が空なら nickname に匿名', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 8,
        rawUserId: 'a:AXaKZ_4ShxQHJVsX',
        hashedUserId: '',
        name: '',
        content: 'hi'
      }
    ]);
    expect(rows).toEqual([
      {
        commentNo: '8',
        text: 'hi',
        userId: 'a:AXaKZ_4ShxQHJVsX',
        nickname: '匿名'
      }
    ]);
  });

  it('複数件を順に返す', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 1,
        rawUserId: 10,
        hashedUserId: '',
        name: '',
        content: 'a'
      },
      {
        no: 2,
        rawUserId: null,
        hashedUserId: 'h2',
        name: 'b',
        content: 'b'
      }
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].commentNo).toBe('1');
    expect(rows[1].commentNo).toBe('2');
  });

  it('空配列・非配列は空配列', () => {
    expect(ndgrChatsToMergeRows([])).toEqual([]);
    expect(ndgrChatsToMergeRows(/** @type {any} */ (null))).toEqual([]);
  });

  // v0.1.803: no が空白文字列(実経路では no は number|null なので来ない異常系)でも
  //   content+userId があれば採用し commentNo は空に正規化する(匿名コメント扱い)。
  it('commentNo が空白のみなら commentNo 空で採用(content+userId 有り)', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: '  \t  ',
        rawUserId: 1,
        hashedUserId: '',
        name: '',
        content: 'hello'
      }
    ]);
    expect(rows).toEqual([{ commentNo: '', text: 'hello', userId: '1' }]);
  });

  it('vpos/accountStatus/is184 をパススルーする', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 10,
        rawUserId: 555,
        hashedUserId: '',
        name: '',
        content: 'extended',
        vpos: 12345,
        accountStatus: 1,
        is184: true
      }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].vpos).toBe(12345);
    expect(rows[0].accountStatus).toBe(1);
    expect(rows[0].is184).toBe(true);
  });

  it('is184=false は省略する', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 11,
        rawUserId: 666,
        hashedUserId: '',
        name: '',
        content: 'normal',
        vpos: 0,
        accountStatus: 0,
        is184: false
      }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].vpos).toBe(0);
    expect(rows[0].accountStatus).toBe(0);
    expect(rows[0]).not.toHaveProperty('is184');
  });

  // v0.1.195: NDGR ギフトシステムメッセージを通常コメント変換から除外
  it('ギフトシステムメッセージ chat を除外する', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 1,
        rawUserId: 'u1',
        hashedUserId: '',
        name: '',
        content: 'こんにちは'
      },
      {
        no: 2,
        rawUserId: 123514112,
        hashedUserId: '',
        name: 'giftevent_xxx',
        content: 'ポンコツびぃちゃんさんがギフト「応援メガホン 黄（10pt）」を贈りました'
      },
      {
        no: 3,
        rawUserId: 'u3',
        hashedUserId: '',
        name: '',
        content: 'おつ〜'
      }
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toBe('こんにちは');
    expect(rows[1].text).toBe('おつ〜');
  });

  it('vpos/accountStatus が null なら省略する', () => {
    const rows = ndgrChatsToMergeRows([
      {
        no: 12,
        rawUserId: 777,
        hashedUserId: '',
        name: '',
        content: 'minimal',
        vpos: null,
        accountStatus: null,
        is184: false
      }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('vpos');
    expect(rows[0]).not.toHaveProperty('accountStatus');
    expect(rows[0]).not.toHaveProperty('is184');
  });
});
