import { describe, it, expect } from 'vitest';
import {
  buildSupportActivityTimeline,
  summarizeTimelineGifts
} from './supportActivityTimeline.js';

const comment = (over = {}) => ({
  id: over.id,
  liveId: 'lv1',
  commentNo: over.commentNo ?? '1',
  userId: over.userId ?? '100',
  nickname: over.nickname ?? 'なまえ',
  text: over.text ?? 'こめんと',
  avatarUrl: over.avatarUrl ?? '',
  selfPosted: over.selfPosted ?? false,
  capturedAt: over.capturedAt ?? 1000
});

const gift = (over = {}) => ({
  userId: over.userId ?? '200',
  nickname: over.nickname ?? 'おくりぬし',
  itemId: over.itemId ?? 'g1',
  itemName: over.itemName ?? 'スーパーチャット',
  point: over.point ?? 500,
  message: over.message ?? '',
  contributionRank: null,
  capturedAt: over.capturedAt ?? 1000
});

describe('buildSupportActivityTimeline', () => {
  it('コメントとギフトを capturedAt 降順（新しい順）で統合する', () => {
    const tl = buildSupportActivityTimeline(
      [comment({ commentNo: '1', capturedAt: 100 }), comment({ commentNo: '2', capturedAt: 300 })],
      [gift({ capturedAt: 200 })]
    );
    expect(tl.map((x) => x.at)).toEqual([300, 200, 100]);
    expect(tl.map((x) => x.kind)).toEqual(['comment', 'gift', 'comment']);
  });

  it('order=asc で古い順', () => {
    const tl = buildSupportActivityTimeline(
      [comment({ capturedAt: 100 }), comment({ capturedAt: 300 })],
      [gift({ capturedAt: 200 })],
      { order: 'asc' }
    );
    expect(tl.map((x) => x.at)).toEqual([100, 200, 300]);
  });

  it('同時刻は desc でギフトを先（投げた瞬間を見落とさない）', () => {
    const tl = buildSupportActivityTimeline(
      [comment({ capturedAt: 500 })],
      [gift({ capturedAt: 500 })]
    );
    expect(tl.map((x) => x.kind)).toEqual(['gift', 'comment']);
  });

  it('同時刻は asc でコメントを先（時系列の自然さ）', () => {
    const tl = buildSupportActivityTimeline(
      [comment({ capturedAt: 500 })],
      [gift({ capturedAt: 500 })],
      { order: 'asc' }
    );
    expect(tl.map((x) => x.kind)).toEqual(['comment', 'gift']);
  });

  it('limit で件数を絞る（order 適用後の先頭から）', () => {
    const comments = Array.from({ length: 10 }, (_, i) =>
      comment({ commentNo: String(i), capturedAt: i * 10 })
    );
    const tl = buildSupportActivityTimeline(comments, [], { limit: 3 });
    expect(tl).toHaveLength(3);
    // desc なので最新3件（at=90,80,70）
    expect(tl.map((x) => x.at)).toEqual([90, 80, 70]);
  });

  it('ギフトの数値・文字フィールドを正規化し負の point は 0 に', () => {
    const tl = buildSupportActivityTimeline([], [gift({ point: -5, itemName: 'x' })]);
    expect(tl[0]).toMatchObject({ kind: 'gift', point: 0, itemName: 'x' });
  });

  it('不正要素（null/非object/時刻なし）は捨てるが時刻0は残す', () => {
    const tl = buildSupportActivityTimeline(
      [null, 'bad', comment({ capturedAt: 0, commentNo: 'z' })],
      [undefined, gift({ capturedAt: 50 })]
    );
    // comment(at0) と gift(at50) の2件のみ
    expect(tl).toHaveLength(2);
    expect(tl.map((x) => x.kind)).toEqual(['gift', 'comment']); // desc: 50 が先
  });

  it('各要素に一意 key が付く（重複しない）', () => {
    const tl = buildSupportActivityTimeline(
      [comment({ id: '', commentNo: '1', userId: '5', capturedAt: 100 }), comment({ id: '', commentNo: '2', userId: '5', capturedAt: 100 })],
      [gift({ capturedAt: 100 }), gift({ capturedAt: 100 })]
    );
    const keys = tl.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('空入力で空配列', () => {
    expect(buildSupportActivityTimeline([], [])).toEqual([]);
    expect(buildSupportActivityTimeline(null, undefined)).toEqual([]);
  });

  it('コメントの selfPosted と avatarUrl を保つ', () => {
    const tl = buildSupportActivityTimeline(
      [comment({ selfPosted: true, avatarUrl: 'https://x/y.jpg' })],
      []
    );
    expect(tl[0]).toMatchObject({ kind: 'comment', selfPosted: true, avatarUrl: 'https://x/y.jpg' });
  });
});

describe('summarizeTimelineGifts', () => {
  it('ギフト件数・合計pt・ユニーク送信者数を集計', () => {
    const tl = buildSupportActivityTimeline(
      [comment({ capturedAt: 10 })],
      [
        gift({ userId: '1', point: 100, capturedAt: 20 }),
        gift({ userId: '1', point: 50, capturedAt: 30 }),
        gift({ userId: '2', point: 200, capturedAt: 40 })
      ]
    );
    expect(summarizeTimelineGifts(tl)).toEqual({
      giftCount: 3,
      giftPoints: 350,
      giftSenders: 2
    });
  });

  it('ギフトなしは全0', () => {
    expect(summarizeTimelineGifts([{ kind: 'comment' }])).toEqual({
      giftCount: 0,
      giftPoints: 0,
      giftSenders: 0
    });
    expect(summarizeTimelineGifts(null)).toEqual({
      giftCount: 0,
      giftPoints: 0,
      giftSenders: 0
    });
  });
});
