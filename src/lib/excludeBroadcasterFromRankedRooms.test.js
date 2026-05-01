/**
 * excludeBroadcasterFromRankedRooms のテスト。
 *
 * 0.1.95 二重表示 fix:
 *   応援ランクストリップ末尾に「配信者専用カード」が常に出る設計だが、
 *   配信者が自分の放送でコメすると aggregateCommentsByUser に room として
 *   集計され、rank strip 1〜10 にも入ってしまう（=同じ配信者が strip 内に
 *   2 度出る現象）。本ヘルパは「rank strip 用に渡す前に配信者本人の room を
 *   除外する」純関数。
 *
 *   配信者本人カードは watchMetaCache.snapshot の broadcaster 情報から別経路で
 *   描画されるので、room 配列から消しても情報は失われない。
 */

import { describe, it, expect } from 'vitest';
import { excludeBroadcasterFromRankedRooms } from './excludeBroadcasterFromRankedRooms.js';

describe('excludeBroadcasterFromRankedRooms', () => {
  it('broadcasterUid が空 → そのまま全件返す（new array）', () => {
    const rooms = [
      { userKey: '111', count: 5 },
      { userKey: '222', count: 3 }
    ];
    const out = excludeBroadcasterFromRankedRooms(rooms, '');
    expect(out).toEqual(rooms);
    expect(out).not.toBe(rooms); // 新配列であること
  });

  it('rooms に配信者 uid がいない → 全件返す', () => {
    const rooms = [
      { userKey: '111', count: 5 },
      { userKey: '222', count: 3 }
    ];
    const out = excludeBroadcasterFromRankedRooms(rooms, '999');
    expect(out).toEqual(rooms);
  });

  it('rooms に配信者 uid が含まれている → その room だけ除外', () => {
    const rooms = [
      { userKey: '999', count: 10, avatarUrl: 'broadcaster.jpg' }, // broadcaster
      { userKey: '111', count: 5 },
      { userKey: '222', count: 3 }
    ];
    const out = excludeBroadcasterFromRankedRooms(rooms, '999');
    expect(out).toEqual([
      { userKey: '111', count: 5 },
      { userKey: '222', count: 3 }
    ]);
  });

  it('uid 空白付きでも正規化して比較', () => {
    const rooms = [
      { userKey: '  999  ', count: 10 },
      { userKey: '111', count: 5 }
    ];
    const out = excludeBroadcasterFromRankedRooms(rooms, ' 999 ');
    expect(out).toEqual([{ userKey: '111', count: 5 }]);
  });

  it('null / undefined rooms → 空配列', () => {
    // @ts-expect-error invalid input
    expect(excludeBroadcasterFromRankedRooms(null, '999')).toEqual([]);
    // @ts-expect-error invalid input
    expect(excludeBroadcasterFromRankedRooms(undefined, '999')).toEqual([]);
  });

  it('rooms に broadcaster が複数回出てきても全部除外（保険）', () => {
    const rooms = [
      { userKey: '999', count: 10 },
      { userKey: '111', count: 5 },
      { userKey: '999', count: 2 }
    ];
    const out = excludeBroadcasterFromRankedRooms(rooms, '999');
    expect(out).toEqual([{ userKey: '111', count: 5 }]);
  });

  it('入力配列を破壊しない', () => {
    const rooms = [
      { userKey: '999', count: 10 },
      { userKey: '111', count: 5 }
    ];
    const original = JSON.parse(JSON.stringify(rooms));
    excludeBroadcasterFromRankedRooms(rooms, '999');
    expect(rooms).toEqual(original);
  });

  it('userKey が undefined / null の room はそのまま通す（broadcaster ではない）', () => {
    const rooms = [
      { userKey: undefined, count: 5 },
      { userKey: null, count: 3 },
      { userKey: '999', count: 10 }
    ];
    const out = excludeBroadcasterFromRankedRooms(rooms, '999');
    expect(out).toEqual([
      { userKey: undefined, count: 5 },
      { userKey: null, count: 3 }
    ]);
  });

  it('配信者本人カードが別経路で描画される前提を反映 (broadcaster の avatarUrl 情報も失わずに room として保持されない)', () => {
    // broadcaster 専用カードは watchMetaCache.snapshot の broadcaster*
    // フィールドから別経路でレンダリングされるので、ここで room を捨てても
    // 情報は失われないという設計判断のテスト。
    const rooms = [
      {
        userKey: '999',
        count: 10,
        avatarUrl: 'https://cdn.example/broadcaster-icon.jpg',
        nickname: 'めじろう'
      },
      { userKey: '111', count: 5 }
    ];
    const out = excludeBroadcasterFromRankedRooms(rooms, '999');
    // out に broadcaster room が含まれないこと
    expect(out.some((r) => r.userKey === '999')).toBe(false);
  });
});
