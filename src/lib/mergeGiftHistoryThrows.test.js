import { describe, it, expect } from 'vitest';
import { aggregateGiftHistoryThrows } from './mergeGiftHistoryThrows.js';

const NOW = 1_700_000_000_000;

describe('aggregateGiftHistoryThrows', () => {
  it('1 履歴 → 1 entry, throwCount=1, totalPoints=points', () => {
    const r = aggregateGiftHistoryThrows(
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

  it('senderAvatarUrl が付いていれば avatarUrl に入る（後続行で補完）', () => {
    const icon = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/1.jpg';
    const r = aggregateGiftHistoryThrows(
      [
        { senderName: 'a', points: 10, itemName: '', time: '', thumbnailUrl: '', senderAvatarUrl: '' },
        { senderName: 'a', points: 20, itemName: '', time: '', thumbnailUrl: '', senderAvatarUrl: icon }
      ],
      NOW
    );
    expect(r.next).toHaveLength(1);
    expect(r.next[0].avatarUrl).toBe(icon);
    expect(r.next[0].totalPoints).toBe(30);
  });

  it('同名 senderName が複数回 → 1 entry に集約、throwCount + totalPoints 加算', () => {
    const r = aggregateGiftHistoryThrows(
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

  it('「同じ scrape 結果が再送信されても結果は同じ（冪等）」 — 重複加算しない', () => {
    // iframe re-mount や Chrome reload で同じ全履歴 payload が再送される
    // ことが頻発するため、毎回「全置換」で集計する設計。これにより throwCount /
    // totalPoints が倍々になる事故を防ぐ（v0.1.216 の重大欠陥対応）。
    const items = [
      { senderName: 'a', points: 100, itemName: '', time: '', thumbnailUrl: '' },
      { senderName: 'a', points: 200, itemName: '', time: '', thumbnailUrl: '' },
      { senderName: 'b', points: 50, itemName: '', time: '', thumbnailUrl: '' }
    ];
    const r1 = aggregateGiftHistoryThrows(items, NOW);
    const r2 = aggregateGiftHistoryThrows(items, NOW + 1000);
    const byKey1 = new Map(r1.next.map((u) => [u.userId, u]));
    const byKey2 = new Map(r2.next.map((u) => [u.userId, u]));
    expect(byKey1.get('__anon_a')?.throwCount).toBe(2);
    expect(byKey2.get('__anon_a')?.throwCount).toBe(2); // 倍々にならない
    expect(byKey1.get('__anon_a')?.totalPoints).toBe(300);
    expect(byKey2.get('__anon_a')?.totalPoints).toBe(300);
    expect(byKey2.get('__anon_b')?.throwCount).toBe(1);
  });

  it('「名無し」「ゲスト」のような既知 anonymous label も __anon_<name> で集約', () => {
    const r = aggregateGiftHistoryThrows(
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
    const r = aggregateGiftHistoryThrows(
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
    const r = aggregateGiftHistoryThrows(
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

  it('itemName/count だけのオブジェクト（種類別集計っぽい形）は senderName が無いので無視（totalCounts 系が混入しても加算されない）', () => {
    const r = aggregateGiftHistoryThrows(
      [{ itemName: 'サッカーボール', count: 4 }],
      NOW
    );
    expect(r.next).toEqual([]);
    expect(r.storageTouched).toBe(false);
  });

  it('incoming が空 → next 空、storageTouched=false', () => {
    const r = aggregateGiftHistoryThrows([], NOW);
    expect(r.next).toEqual([]);
    expect(r.storageTouched).toBe(false);
  });

  it('null/undefined 入力は安全', () => {
    const r1 = aggregateGiftHistoryThrows(null, NOW);
    expect(r1.next).toEqual([]);
    expect(r1.storageTouched).toBe(false);
    const r2 = aggregateGiftHistoryThrows(undefined, NOW);
    expect(r2.next).toEqual([]);
    expect(r2.storageTouched).toBe(false);
  });

  it('実機 lv350474211 に近い 3 名のシナリオで合計 pt 順にソート可能', () => {
    const r = aggregateGiftHistoryThrows(
      [
        { senderName: 'ぱぴよん', points: 800, itemName: 'スプーン', time: '5:44:50', thumbnailUrl: '' },
        { senderName: 'うっぺ', points: 500, itemName: 'スプーン', time: '3:08:35', thumbnailUrl: '' },
        { senderName: 'ばんぺいゆ', points: 100, itemName: 'スプーン', time: '5:05:09', thumbnailUrl: '' }
      ],
      NOW
    );
    expect(r.next).toHaveLength(3);
    const sorted = [...r.next].sort((a, b) => b.totalPoints - a.totalPoints);
    expect(sorted.map((u) => u.nickname)).toEqual(['ぱぴよん', 'うっぺ', 'ばんぺいゆ']);
    expect(sorted.map((u) => u.totalPoints)).toEqual([800, 500, 100]);
  });
});
