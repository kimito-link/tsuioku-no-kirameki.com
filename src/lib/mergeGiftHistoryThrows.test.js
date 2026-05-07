import { describe, it, expect } from 'vitest';
import { mergeGiftHistoryThrows } from './mergeGiftHistoryThrows.js';

const NOW = 1_700_000_000_000;

describe('mergeGiftHistoryThrows', () => {
  it('空 existing + 1 履歴 → 1 entry, throwCount=1', () => {
    const r = mergeGiftHistoryThrows(
      [],
      [{ senderName: 'ぱぴよん', points: 800, itemName: 'スプーン', time: '05:53', thumbnailUrl: '' }],
      NOW
    );
    expect(r.next).toHaveLength(1);
    expect(r.next[0].userId).toBe('__anon_ぱぴよん');
    expect(r.next[0].nickname).toBe('ぱぴよん');
    expect(r.next[0].throwCount).toBe(1);
    expect(r.next[0].totalPoints).toBe(800);
    expect(r.next[0].capturedAt).toBe(NOW);
    expect(r.storageTouched).toBe(true);
  });

  it('同名 senderName が複数回 → 1 entry に集約、throwCount + totalPoints 加算', () => {
    const r = mergeGiftHistoryThrows(
      [],
      [
        { senderName: 'ぱぴよん', points: 800, itemName: '錬金窯', time: '05:53', thumbnailUrl: '' },
        { senderName: 'ぱぴよん', points: 100, itemName: 'スプーン', time: '05:51', thumbnailUrl: '' },
        { senderName: 'うっぺ', points: 500, itemName: 'わこつ茶', time: '05:47', thumbnailUrl: '' }
      ],
      NOW
    );
    expect(r.next).toHaveLength(2);
    const byKey = new Map(r.next.map((u) => [u.userId, u]));
    expect(byKey.get('__anon_ぱぴよん')?.throwCount).toBe(2);
    expect(byKey.get('__anon_ぱぴよん')?.totalPoints).toBe(900);
    expect(byKey.get('__anon_うっぺ')?.throwCount).toBe(1);
    expect(byKey.get('__anon_うっぺ')?.totalPoints).toBe(500);
  });

  it('既存 entry に追加 → throwCount + totalPoints 累積、capturedAt 更新', () => {
    const existing = [
      {
        userId: '__anon_ぱぴよん',
        nickname: 'ぱぴよん',
        throwCount: 2,
        totalPoints: 900,
        capturedAt: NOW - 60_000
      }
    ];
    const r = mergeGiftHistoryThrows(
      existing,
      [{ senderName: 'ぱぴよん', points: 200, itemName: 'スプーン', time: '06:00', thumbnailUrl: '' }],
      NOW
    );
    expect(r.next).toHaveLength(1);
    expect(r.next[0].throwCount).toBe(3);
    expect(r.next[0].totalPoints).toBe(1100);
    expect(r.next[0].capturedAt).toBe(NOW);
  });

  it('senderName 空 / 「名無し さん」 のような既知の anonymous label は __anon_<name> で集約', () => {
    const r = mergeGiftHistoryThrows(
      [],
      [
        { senderName: '名無し', points: 5, itemName: 'スプーン', time: '03:58', thumbnailUrl: '' },
        { senderName: '名無し', points: 10, itemName: 'フラスコ', time: '02:49', thumbnailUrl: '' },
        { senderName: 'ゲスト', points: 10, itemName: 'フラスコ', time: '02:52', thumbnailUrl: '' }
      ],
      NOW
    );
    expect(r.next).toHaveLength(2);
    const byKey = new Map(r.next.map((u) => [u.userId, u]));
    expect(byKey.get('__anon_名無し')?.throwCount).toBe(2);
    expect(byKey.get('__anon_名無し')?.totalPoints).toBe(15);
    expect(byKey.get('__anon_ゲスト')?.throwCount).toBe(1);
  });

  it('senderName 空白のみは skip', () => {
    const r = mergeGiftHistoryThrows(
      [],
      [
        { senderName: '', points: 5, itemName: '', time: '', thumbnailUrl: '' },
        { senderName: '   ', points: 10, itemName: '', time: '', thumbnailUrl: '' },
        { senderName: 'sanson', points: 50, itemName: 'わこつ茶', time: '01:23', thumbnailUrl: '' }
      ],
      NOW
    );
    expect(r.next).toHaveLength(1);
    expect(r.next[0].userId).toBe('__anon_sanson');
  });

  it('points が無効（負 / NaN / 文字列）は totalPoints=0 として扱う', () => {
    const r = mergeGiftHistoryThrows(
      [],
      [
        { senderName: 'a', points: -1, itemName: '', time: '', thumbnailUrl: '' },
        { senderName: 'b', points: NaN, itemName: '', time: '', thumbnailUrl: '' },
        { senderName: 'c', points: /** @type {any} */ ('abc'), itemName: '', time: '', thumbnailUrl: '' }
      ],
      NOW
    );
    expect(r.next).toHaveLength(3);
    for (const u of r.next) {
      expect(u.throwCount).toBe(1);
      expect(u.totalPoints).toBe(0);
    }
  });

  it('incoming が空 → next は existing と同一、storageTouched=false', () => {
    const existing = [
      {
        userId: '__anon_x',
        nickname: 'x',
        throwCount: 1,
        totalPoints: 5,
        capturedAt: NOW - 1000
      }
    ];
    const r = mergeGiftHistoryThrows(existing, [], NOW);
    expect(r.next).toBe(existing);
    expect(r.storageTouched).toBe(false);
  });

  it('既存に同じ throw が来ても throwCount は incoming 件数分のみ加算（履歴は冪等ではないので毎回加算）', () => {
    // 注意: 履歴は時系列の event log なので、同じ scrape 結果を繰り返し受け取ると
    //       throwCount が重複加算される。呼出側で diff 取るか、scrape interval を
    //       長めにする運用前提。本関数の責務は「incoming = N event → N 加算」。
    const existing = [
      {
        userId: '__anon_a',
        nickname: 'a',
        throwCount: 1,
        totalPoints: 100,
        capturedAt: NOW - 1000
      }
    ];
    const r = mergeGiftHistoryThrows(
      existing,
      [{ senderName: 'a', points: 100, itemName: '', time: '', thumbnailUrl: '' }],
      NOW
    );
    expect(r.next[0].throwCount).toBe(2);
    expect(r.next[0].totalPoints).toBe(200);
  });

  it('null/undefined 入力は安全', () => {
    const r1 = mergeGiftHistoryThrows(null, null, NOW);
    expect(r1.next).toEqual([]);
    expect(r1.storageTouched).toBe(false);
    const r2 = mergeGiftHistoryThrows(undefined, undefined, NOW);
    expect(r2.next).toEqual([]);
    expect(r2.storageTouched).toBe(false);
  });
});
