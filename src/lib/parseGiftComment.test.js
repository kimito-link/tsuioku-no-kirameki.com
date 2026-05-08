/**
 * parseGiftCommentText / summarizeGiftComments のテスト。
 *
 * 0.1.175: 番組内ギフトの送信者・アイテム・ポイントを、コメントテーブル DOM の
 * テキストからパースする純粋関数。autoOpen を迂回した取得経路の中核。
 */

import { describe, it, expect } from 'vitest';
import { parseGiftCommentText, summarizeGiftComments } from './parseGiftComment.js';

describe('parseGiftCommentText', () => {
  it('標準形式（全角括弧）をパースできる', () => {
    expect(
      parseGiftCommentText('シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました')
    ).toEqual({
      sender: 'シンラツ',
      item: '応援メガホン 黄',
      point: 10
    });
  });

  it('名無しさんもパースできる', () => {
    expect(
      parseGiftCommentText('名無しさんがギフト「応援メガホン 青（5pt）」を贈りました')
    ).toEqual({
      sender: '名無し',
      item: '応援メガホン 青',
      point: 5
    });
  });

  it('半角括弧でもパースできる', () => {
    expect(
      parseGiftCommentText('テストさんがギフト「アイテム(100pt)」を贈りました')
    ).toEqual({
      sender: 'テスト',
      item: 'アイテム',
      point: 100
    });
  });

  it('高ポイントギフトもパースできる', () => {
    expect(
      parseGiftCommentText('豪華さんがギフト「金一封（10000pt）」を贈りました')
    ).toEqual({
      sender: '豪華',
      item: '金一封',
      point: 10000
    });
  });

  it('文末に追加情報があってもパースできる（部分一致）', () => {
    expect(
      parseGiftCommentText('Aさんがギフト「item（1pt）」を贈りました（おまけ）')
    ).toEqual({
      sender: 'A',
      item: 'item',
      point: 1
    });
  });

  it('ギフトコメント以外は null', () => {
    expect(parseGiftCommentText('普通のコメント')).toBe(null);
    expect(parseGiftCommentText('')).toBe(null);
    expect(parseGiftCommentText('1000円')).toBe(null);
  });

  it('入力が string でなければ null', () => {
    // @ts-expect-error invalid input
    expect(parseGiftCommentText(null)).toBe(null);
    // @ts-expect-error invalid input
    expect(parseGiftCommentText(undefined)).toBe(null);
    // @ts-expect-error invalid input
    expect(parseGiftCommentText(123)).toBe(null);
  });

  it('点数が数字でない異常入力も null', () => {
    expect(
      parseGiftCommentText('Aさんがギフト「item（abc pt）」を贈りました')
    ).toBe(null);
  });

  // 0.1.177: niconico 実機で観測された順位プレフィックスへの対応
  it('【ギフト貢献N位】プレフィックスを sender から除外し rank に切り出す', () => {
    expect(
      parseGiftCommentText(
        '【ギフト貢献4位】エマさんがギフト「応援メガホン 水色（10pt）」を贈りました'
      )
    ).toEqual({
      sender: 'エマ',
      item: '応援メガホン 水色',
      point: 10,
      rank: 4
    });
  });

  it('【ギフト貢献1位】も正しく rank=1', () => {
    expect(
      parseGiftCommentText(
        '【ギフト貢献1位】豪華さんがギフト「金一封（10000pt）」を贈りました'
      )
    ).toEqual({
      sender: '豪華',
      item: '金一封',
      point: 10000,
      rank: 1
    });
  });

  it('複数のプレフィックスがあっても sender だけ取れる', () => {
    expect(
      parseGiftCommentText(
        '【新規】【ギフト貢献2位】Bさんがギフト「item（5pt）」を贈りました'
      )
    ).toEqual({
      sender: 'B',
      item: 'item',
      point: 5,
      rank: 2
    });
  });

  it('ギフト貢献以外のプレフィックスは rank を付けない', () => {
    expect(
      parseGiftCommentText('【新規】Cさんがギフト「item（3pt）」を贈りました')
    ).toEqual({
      sender: 'C',
      item: 'item',
      point: 3
    });
  });
});

describe('summarizeGiftComments', () => {
  it('空入力で全部 0', () => {
    expect(summarizeGiftComments([])).toEqual({
      totalCount: 0,
      totalPoints: 0,
      uniqueSenderCount: 0,
      uniqueItemCount: 0,
      topSenders: [],
      topItems: []
    });
  });

  it('複数ギフトを sender / item で集計する', () => {
    const rows = [
      { sender: 'A', item: 'メガホン青', point: 5 },
      { sender: 'A', item: 'メガホン黄', point: 10 },
      { sender: 'B', item: 'メガホン青', point: 5 },
      { sender: 'A', item: 'メガホン青', point: 5 }
    ];
    const r = summarizeGiftComments(rows);
    expect(r.totalCount).toBe(4);
    expect(r.totalPoints).toBe(25);
    expect(r.uniqueSenderCount).toBe(2);
    expect(r.uniqueItemCount).toBe(2);
    // A: 20pt 3件, B: 5pt 1件 → A が top
    expect(r.topSenders[0]).toEqual({ sender: 'A', totalPoints: 20, count: 3 });
    expect(r.topSenders[1]).toEqual({ sender: 'B', totalPoints: 5, count: 1 });
    // メガホン青 3件, メガホン黄 1件
    expect(r.topItems[0]).toEqual({ item: 'メガホン青', count: 3, totalPoints: 15 });
    expect(r.topItems[1]).toEqual({ item: 'メガホン黄', count: 1, totalPoints: 10 });
  });

  it('topSenders は 10 件で打ち切り', () => {
    const rows = [];
    for (let i = 0; i < 15; i++) {
      rows.push({ sender: `User${i}`, item: 'item', point: 100 - i });
    }
    const r = summarizeGiftComments(rows);
    expect(r.topSenders.length).toBe(10);
    expect(r.uniqueSenderCount).toBe(15);
    // top はポイントの大きい順
    expect(r.topSenders[0].sender).toBe('User0');
    expect(r.topSenders[0].totalPoints).toBe(100);
  });

  it('null や 不正な行はスキップ', () => {
    const rows = [
      { sender: 'A', item: 'item', point: 10 },
      // @ts-expect-error invalid
      null,
      { sender: '', item: 'item', point: 10 },
      { sender: 'B', item: '', point: 10 },
      { sender: 'C', item: 'item', point: 5 }
    ];
    // @ts-expect-error null mixed
    const r = summarizeGiftComments(rows);
    expect(r.totalCount).toBe(2);
    expect(r.uniqueSenderCount).toBe(2);
  });
});
