import { describe, expect, it } from 'vitest';
import {
  comeviewTimelineItemSignature,
  filterVisibleComeviewTimeline,
  keepLatestComeviewTimelineItems,
  pickNewComeviewTimelineItems,
  pickAppendedComeviewSnapshotRows,
  selectAppendedComeviewTimelineItems,
  isComeviewNearBottom
} from './comeviewInstantRender.js';

const commentItem = (over = {}) => ({
  kind: 'comment',
  key: over.key ?? 'c1',
  at: over.at ?? 100,
  userId: over.userId ?? '10',
  nickname: over.nickname ?? 'りすなー',
  text: over.text ?? 'こんにちは',
  commentNo: over.commentNo ?? '1',
  avatarUrl: '',
  selfPosted: false
});

const giftItem = (over = {}) => ({
  kind: 'gift',
  key: over.key ?? 'g1',
  at: over.at ?? 200,
  userId: over.userId ?? '20',
  nickname: over.nickname ?? 'おくりぬし',
  itemName: over.itemName ?? '花火',
  point: over.point ?? 100,
  message: over.message ?? '',
  avatarUrl: ''
});

describe('comeviewTimelineItemSignature', () => {
  it('コメントは uid と500字以内の本文で作る', () => {
    expect(
      comeviewTimelineItemSignature(commentItem({ userId: ' 10 ', text: ' こんにちは ' }))
    ).toBe('c|10|こんにちは');
  });

  it('ギフトは uid と120字以内の品名で作る', () => {
    expect(
      comeviewTimelineItemSignature(giftItem({ userId: '20', itemName: ' 花火 ' }))
    ).toBe('g|20|花火');
  });
});

describe('filterVisibleComeviewTimeline', () => {
  it('NGユーザーと行シグネチャ非表示を両方除く', () => {
    const hidden = commentItem({ key: 'hidden', userId: '2', text: '隠す' });
    const visible = commentItem({ key: 'visible', userId: '3', text: '残す' });
    const out = filterVisibleComeviewTimeline(
      [commentItem({ key: 'ng', userId: '1' }), hidden, visible],
      new Set(['u:1']),
      new Set([comeviewTimelineItemSignature(hidden)])
    );
    expect(out.map((item) => item.key)).toEqual(['visible']);
  });
});

describe('最新件数と差分append', () => {
  it('昇順の末尾から最新120件だけを残す', () => {
    const rows = Array.from({ length: 125 }, (_, i) =>
      commentItem({ key: `c${i}`, at: i })
    );
    const out = keepLatestComeviewTimelineItems(rows, 120);
    expect(out).toHaveLength(120);
    expect(out[0].key).toBe('c5');
    expect(out.at(-1).key).toBe('c124');
  });

  it('TimelineItem.key が未描画の行だけを一度ずつ返す', () => {
    const out = pickNewComeviewTimelineItems(
      [
        commentItem({ key: 'old' }),
        commentItem({ key: 'new' }),
        commentItem({ key: 'new' })
      ],
      new Set(['old'])
    );
    expect(out.map((item) => item.key)).toEqual(['new']);
  });
});

describe('storage snapshot の追加分抽出', () => {
  it('FIFOで先頭が落ちても末尾の新着だけを返す', () => {
    const previous = [
      { commentNo: '1', userId: '1', text: 'a', capturedAt: 1 },
      { commentNo: '2', userId: '2', text: 'b', capturedAt: 2 }
    ];
    const next = [
      { commentNo: '2', userId: '2', text: 'b', capturedAt: 2 },
      { commentNo: '3', userId: '3', text: 'c', capturedAt: 3 }
    ];
    expect(pickAppendedComeviewSnapshotRows(previous, next, 'comment')).toEqual([
      next[1]
    ]);
  });

  it('noだけの行も共有builderと同じく本文・uid・時刻で照合する', () => {
    const previous = [{ no: 1, userId: '1', text: 'a', capturedAt: 1 }];
    const next = [
      { no: 1, userId: '1', text: 'a', capturedAt: 1 },
      { no: 2, userId: '2', text: 'b', capturedAt: 2 }
    ];
    expect(pickAppendedComeviewSnapshotRows(previous, next, 'comment')).toEqual([
      next[1]
    ]);
  });

  it('同一内容の重複も個数差で新着を判定する', () => {
    const gift = {
      userId: '1',
      itemName: '花火',
      point: 100,
      message: '',
      capturedAt: 10
    };
    expect(pickAppendedComeviewSnapshotRows([gift], [gift, gift], 'gift')).toEqual([
      gift
    ]);
  });

  it('現在snapshotから追加行に対応するTimelineItemだけを選ぶ', () => {
    const addedComment = {
      commentNo: '2',
      userId: '2',
      text: 'new',
      capturedAt: 200
    };
    const addedGift = {
      userId: '3',
      itemName: '花火',
      point: 100,
      message: '応援',
      capturedAt: 300
    };
    const timeline = [
      commentItem({ key: 'old', commentNo: '1', userId: '1', text: 'old', at: 100 }),
      commentItem({
        key: 'new-comment',
        commentNo: '2',
        userId: '2',
        text: 'new',
        at: 200
      }),
      giftItem({
        key: 'new-gift',
        userId: '3',
        itemName: '花火',
        point: 100,
        message: '応援',
        at: 300
      })
    ];
    expect(
      selectAppendedComeviewTimelineItems(timeline, [addedComment], [addedGift]).map(
        (item) => item.key
      )
    ).toEqual(['new-comment', 'new-gift']);
  });
});

describe('isComeviewNearBottom', () => {
  it('最下部から80px以内だけ追従対象にする', () => {
    expect(
      isComeviewNearBottom({ scrollTop: 720, clientHeight: 200, scrollHeight: 1000 })
    ).toBe(true);
    expect(
      isComeviewNearBottom({ scrollTop: 719, clientHeight: 200, scrollHeight: 1000 })
    ).toBe(false);
  });
});
