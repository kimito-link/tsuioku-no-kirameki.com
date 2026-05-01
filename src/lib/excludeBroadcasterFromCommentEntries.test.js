/**
 * excludeBroadcasterFromCommentEntries のテスト。
 *
 * 0.1.100 broadcaster comment exclusion:
 *   配信者本人が自分の放送で post したコメは「応援コメ」ではなく
 *   broadcasting 側の発言なので、popup の story growth grid / comment ticker /
 *   lane 集約から除外する設計。0.1.95 の room レベル除外
 *   (excludeBroadcasterFromRankedRooms) を comment レベルにも対応させる。
 *
 *   配信者本人カードは watchMetaCache.snapshot.broadcaster* から別経路で
 *   描画されるので、comment 配列から除外しても情報は失われない。
 *
 *   HTML レポート側 (popup-entry.js:7745 周辺) では既に同じ意味の
 *   inline filter (`reportBroadcasterUserId && uid === reportBroadcasterUserId`)
 *   が個別コメに適用されているが、popup display 側には未適用だった。
 */

import { describe, it, expect } from 'vitest';
import { excludeBroadcasterFromCommentEntries } from './excludeBroadcasterFromCommentEntries.js';

describe('excludeBroadcasterFromCommentEntries', () => {
  it('broadcasterUid が空 → そのまま全件返す（new array）', () => {
    const entries = [
      { userId: '111', text: 'a' },
      { userId: '222', text: 'b' }
    ];
    const out = excludeBroadcasterFromCommentEntries(entries, '');
    expect(out).toEqual(entries);
    expect(out).not.toBe(entries);
  });

  it('entries に broadcaster userId がいない → 全件返す', () => {
    const entries = [
      { userId: '111', text: 'a' },
      { userId: '222', text: 'b' }
    ];
    const out = excludeBroadcasterFromCommentEntries(entries, '999');
    expect(out).toEqual(entries);
  });

  it('entries に broadcaster userId のコメが含まれている → 全部除外', () => {
    const entries = [
      { userId: '999', text: 'broadcaster opening' },
      { userId: '111', text: 'viewer 1' },
      { userId: '999', text: 'broadcaster again' },
      { userId: '222', text: 'viewer 2' }
    ];
    const out = excludeBroadcasterFromCommentEntries(entries, '999');
    expect(out).toEqual([
      { userId: '111', text: 'viewer 1' },
      { userId: '222', text: 'viewer 2' }
    ]);
  });

  it('uid 空白付きでも正規化して比較', () => {
    const entries = [
      { userId: '  999  ', text: 'broadcaster' },
      { userId: '111', text: 'viewer' }
    ];
    const out = excludeBroadcasterFromCommentEntries(entries, ' 999 ');
    expect(out).toEqual([{ userId: '111', text: 'viewer' }]);
  });

  it('null / undefined entries → 空配列', () => {
    // @ts-expect-error invalid input
    expect(excludeBroadcasterFromCommentEntries(null, '999')).toEqual([]);
    // @ts-expect-error invalid input
    expect(excludeBroadcasterFromCommentEntries(undefined, '999')).toEqual([]);
  });

  it('空配列 → 空配列', () => {
    expect(excludeBroadcasterFromCommentEntries([], '999')).toEqual([]);
  });

  it('userId が undefined / null のコメはそのまま通す（broadcaster ではない）', () => {
    // ID 未取得（DOM に投稿者情報なし）コメは broadcaster と一致しないので残す。
    // 0.1.99 universal rule で avatar は別途 reject されるので、broadcaster icon
    // が乗っていてもこの関数では除外不要。
    const entries = [
      { userId: undefined, text: 'unknown' },
      { userId: null, text: 'unknown' },
      { userId: '999', text: 'broadcaster' }
    ];
    const out = excludeBroadcasterFromCommentEntries(entries, '999');
    expect(out).toEqual([
      { userId: undefined, text: 'unknown' },
      { userId: null, text: 'unknown' }
    ]);
  });

  it('入力配列を破壊しない', () => {
    const entries = [
      { userId: '999', text: 'broadcaster' },
      { userId: '111', text: 'viewer' }
    ];
    const original = JSON.parse(JSON.stringify(entries));
    excludeBroadcasterFromCommentEntries(entries, '999');
    expect(entries).toEqual(original);
  });

  it('a:xxx 匿名コメは broadcaster と一致しないので残す', () => {
    const entries = [
      { userId: 'a:Xu-Sy7ai1e_kgbq3', text: 'anon viewer' },
      { userId: '999', text: 'broadcaster' }
    ];
    const out = excludeBroadcasterFromCommentEntries(entries, '999');
    expect(out).toEqual([{ userId: 'a:Xu-Sy7ai1e_kgbq3', text: 'anon viewer' }]);
  });

  it('selfPosted フラグなど他のフィールドは保持', () => {
    const entries = [
      { userId: '111', text: 'self', selfPosted: true, capturedAt: 1234 },
      { userId: '999', text: 'broadcaster' }
    ];
    const out = excludeBroadcasterFromCommentEntries(entries, '999');
    expect(out).toEqual([
      { userId: '111', text: 'self', selfPosted: true, capturedAt: 1234 }
    ]);
  });
});
