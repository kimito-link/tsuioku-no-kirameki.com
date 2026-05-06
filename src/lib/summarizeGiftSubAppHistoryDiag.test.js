/**
 * v0.1.201: gift sub-app 履歴を診断 JSON 用 summary に変換する純関数のテスト。
 *
 * 既存 `formatGiftSubAppHistory.js#summarizeGiftSubAppHistory` は popup の
 * 表示ラベル用（5 フィールド）。本 summary は診断 JSON 統合用（10 フィールド、
 * 上位 senders / items の sample / 解決済 sender 数 / iframe 数まで）。
 */

import { describe, it, expect } from 'vitest';
import { summarizeGiftSubAppHistoryDiag } from './summarizeGiftSubAppHistoryDiag.js';

describe('summarizeGiftSubAppHistoryDiag', () => {
  it('null/undefined では空 summary を返す（診断 JSON が壊れない）', () => {
    // v0.1.203: failureReason を含む（iframe なしの状態 = 'no_iframe_found'）
    const empty = {
      historyCount: 0,
      itemTypeCount: 0,
      resolvedSenderCount: 0,
      unresolvedSenderCount: 0,
      topSenders: [],
      topItems: [],
      totalPoints: 0,
      iframeCount: 0,
      scrapableFrameCount: 0,
      failureReason: 'no_iframe_found'
    };
    expect(summarizeGiftSubAppHistoryDiag(null)).toEqual(empty);
    expect(summarizeGiftSubAppHistoryDiag(undefined)).toEqual(empty);
    expect(summarizeGiftSubAppHistoryDiag({})).toEqual(empty);
  });

  it('v0.1.203: 実機 lv350471922 のシナリオ（iframe 2 / scrape 0 / history 0）→ cross_origin_iframe_only', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      history: [],
      totalCounts: [],
      scannedFrames: 2,
      observedFrames: 0
    });
    expect(r.failureReason).toBe('cross_origin_iframe_only');
    expect(r.historyCount).toBe(0);
    expect(r.iframeCount).toBe(2);
    expect(r.scrapableFrameCount).toBe(0);
  });

  it('v0.1.203: 履歴が取れているとき（success）→ failureReason は null', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      history: [{ senderName: 'alice', points: 100, itemName: 'item1' }],
      totalCounts: [],
      scannedFrames: 2,
      observedFrames: 1
    });
    expect(r.failureReason).toBeNull();
    expect(r.historyCount).toBe(1);
  });

  it('history と totalCounts の件数を正確に数える', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      history: [
        { senderName: 'quest', points: 9000, itemName: 'かわいい' },
        { senderName: 'alice', points: 100, itemName: '100てん！' }
      ],
      totalCounts: [
        { itemName: 'かわいい', count: 1 },
        { itemName: '100てん！', count: 5 },
        { itemName: 'ぴえん', count: 3 }
      ]
    });
    expect(r.historyCount).toBe(2);
    expect(r.itemTypeCount).toBe(3);
    expect(r.totalPoints).toBe(9100);
  });

  it('「名無し」「ゲスト」のみの sender は unresolved にカウント', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      history: [
        { senderName: 'quest', points: 9000, itemName: 'A' },
        { senderName: '名無し', points: 100, itemName: 'B' },
        { senderName: 'ゲスト', points: 200, itemName: 'C' },
        { senderName: 'alice', points: 50, itemName: 'D' },
        { senderName: '', points: 10, itemName: 'E' } // 空も unresolved
      ]
    });
    expect(r.resolvedSenderCount).toBe(2); // quest, alice
    expect(r.unresolvedSenderCount).toBe(3); // 名無し, ゲスト, 空
  });

  it('topSenders は totalPoints 降順で最大 5 名（同名 sender は集計）', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      history: [
        { senderName: 'a', points: 100, itemName: 'x' },
        { senderName: 'b', points: 500, itemName: 'x' },
        { senderName: 'c', points: 300, itemName: 'x' },
        { senderName: 'd', points: 50, itemName: 'x' },
        { senderName: 'e', points: 700, itemName: 'x' },
        { senderName: 'f', points: 10, itemName: 'x' },
        { senderName: 'b', points: 250, itemName: 'y' } // b が 500+250=750
      ]
    });
    expect(r.topSenders).toHaveLength(5);
    expect(r.topSenders[0]).toEqual({ name: 'b', totalPoints: 750 });
    expect(r.topSenders[1]).toEqual({ name: 'e', totalPoints: 700 });
    expect(r.topSenders[2]).toEqual({ name: 'c', totalPoints: 300 });
    expect(r.topSenders[3]).toEqual({ name: 'a', totalPoints: 100 });
    expect(r.topSenders[4]).toEqual({ name: 'd', totalPoints: 50 });
  });

  it('topItems は count 降順で最大 5 種類', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      totalCounts: [
        { itemName: 'a', count: 1 },
        { itemName: 'b', count: 11 },
        { itemName: 'c', count: 3 },
        { itemName: 'd', count: 7 },
        { itemName: 'e', count: 2 },
        { itemName: 'f', count: 9 },
        { itemName: 'g', count: 4 }
      ]
    });
    expect(r.topItems).toHaveLength(5);
    expect(r.topItems[0]).toEqual({ name: 'b', count: 11 });
    expect(r.topItems[1]).toEqual({ name: 'f', count: 9 });
    expect(r.topItems[2]).toEqual({ name: 'd', count: 7 });
    expect(r.topItems[3]).toEqual({ name: 'g', count: 4 });
    expect(r.topItems[4]).toEqual({ name: 'c', count: 3 });
  });

  it('iframeCount / scrapableFrameCount は payload から読む（content-script 観測値）', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      history: [],
      totalCounts: [],
      scannedFrames: 3,
      observedFrames: 1
    });
    expect(r.iframeCount).toBe(3);
    expect(r.scrapableFrameCount).toBe(1);
  });

  it('壊れた item（数値以外の points / 文字列フィールド欠落）は無視', () => {
    const r = summarizeGiftSubAppHistoryDiag({
      history: [
        { senderName: 'ok', points: 100, itemName: 'A' },
        { senderName: 'broken', points: 'abc', itemName: 'B' }, // points が文字列 → totalPoints 不加算
        null,
        { senderName: null, points: 50, itemName: 'C' }, // sender が null → unresolved
        undefined
      ]
    });
    // historyCount は array length （壊れていても件数として数える）
    expect(r.historyCount).toBe(5);
    // 集計可能な points のみ（broken の文字列 points は不加算）
    expect(r.totalPoints).toBe(150); // ok 100 + null-sender 50
    // sender 名から判定。'ok', 'broken' は resolved
    expect(r.resolvedSenderCount).toBe(2);
    // null/undefined item, null sender = 3 件
    expect(r.unresolvedSenderCount).toBe(3);
  });

  it('history のみ / totalCounts のみのケースでも壊れない', () => {
    const r1 = summarizeGiftSubAppHistoryDiag({
      history: [{ senderName: 'a', points: 100, itemName: 'x' }]
    });
    expect(r1.historyCount).toBe(1);
    expect(r1.itemTypeCount).toBe(0);
    const r2 = summarizeGiftSubAppHistoryDiag({
      totalCounts: [{ itemName: 'x', count: 5 }]
    });
    expect(r2.historyCount).toBe(0);
    expect(r2.itemTypeCount).toBe(1);
  });
});
