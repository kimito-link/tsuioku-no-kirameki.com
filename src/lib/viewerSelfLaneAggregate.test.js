import { describe, it, expect } from 'vitest';
import { appendViewerSelfLaneAggregate } from './viewerSelfLaneAggregate.js';

const http = (u) => /^https?:\/\//i.test(String(u || ''));
const baseOpts = {
  viewerUserId: '12345',
  viewerNickname: 'わたし',
  viewerAvatarUrl: 'https://example.com/me.jpg',
  liveId: 'lv1',
  ownPostedCount: 3,
  nowMs: 1000,
  isHttpUrl: http
};

describe('appendViewerSelfLaneAggregate', () => {
  it('数値ID+個人アイコン+投稿あり なら自分の集約を先頭に足す', () => {
    const r = appendViewerSelfLaneAggregate([], baseOpts);
    expect(r.injected).toBe(true);
    expect(r.viewerUserId).toBe('12345');
    expect(r.aggregates).toHaveLength(1);
    expect(r.aggregates[0]).toMatchObject({
      userId: '12345',
      nickname: 'わたし',
      avatarUrl: 'https://example.com/me.jpg',
      avatarObserved: true,
      commentCount: 3,
      _laneSortAt: 1000
    });
  });

  it('自分の投稿が0件なら足さない(投稿してないのに自分を出さない)', () => {
    const r = appendViewerSelfLaneAggregate([], { ...baseOpts, ownPostedCount: 0 });
    expect(r.injected).toBe(false);
    expect(r.aggregates).toHaveLength(0);
  });

  it('viewerUserId が数値でない(匿名/空)なら足さない', () => {
    expect(appendViewerSelfLaneAggregate([], { ...baseOpts, viewerUserId: 'a:HASH' }).injected).toBe(false);
    expect(appendViewerSelfLaneAggregate([], { ...baseOpts, viewerUserId: '' }).injected).toBe(false);
  });

  it('個人アイコンが無い/非httpなら足さない(匿名段に委ねる)', () => {
    expect(appendViewerSelfLaneAggregate([], { ...baseOpts, viewerAvatarUrl: '' }).injected).toBe(false);
    expect(appendViewerSelfLaneAggregate([], { ...baseOpts, viewerAvatarUrl: 'data:image/png;base64,xx' }).injected).toBe(false);
  });

  it('既存に同 userId の集約があれば重複させずアイコン/observed を補強', () => {
    const existing = [{ userId: '12345', nickname: '旧名', avatarUrl: '', avatarObserved: false, liveId: 'lv1', commentCount: 1, giftCount: 0, _laneSortAt: 5 }];
    const r = appendViewerSelfLaneAggregate(existing, baseOpts);
    expect(r.injected).toBe(true);
    expect(r.aggregates).toHaveLength(1); // 重複しない
    expect(r.aggregates[0].avatarUrl).toBe('https://example.com/me.jpg'); // 空→viewer アイコンで補強
    expect(r.aggregates[0].avatarObserved).toBe(true);
  });

  it('既存集約に有効アイコンがあれば上書きしない(observed だけ立てる)', () => {
    const existing = [{ userId: '12345', nickname: 'X', avatarUrl: 'https://example.com/keep.jpg', avatarObserved: false, liveId: 'lv1', commentCount: 2, giftCount: 0, _laneSortAt: 9 }];
    const r = appendViewerSelfLaneAggregate(existing, baseOpts);
    expect(r.aggregates[0].avatarUrl).toBe('https://example.com/keep.jpg');
    expect(r.aggregates[0].avatarObserved).toBe(true);
  });

  it('他人の集約は保持し、自分を先頭に足す', () => {
    const others = [{ userId: '999', nickname: '他', avatarUrl: 'https://example.com/o.jpg', avatarObserved: true, liveId: 'lv1', commentCount: 5, giftCount: 0, _laneSortAt: 50 }];
    const r = appendViewerSelfLaneAggregate(others, baseOpts);
    expect(r.aggregates).toHaveLength(2);
    expect(r.aggregates[0].userId).toBe('12345'); // 自分が先頭
    expect(r.aggregates[1].userId).toBe('999');
  });
});
