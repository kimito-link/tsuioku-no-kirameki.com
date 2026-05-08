/**
 * gift sub-app DOM 由来の history / totalCounts を popup 表示用にフォーマットする
 * 純関数のテスト。
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeGiftSubAppHistory,
  formatGiftSubAppHistorySummaryLabel
} from './formatGiftSubAppHistory.js';

describe('summarizeGiftSubAppHistory', () => {
  it('null / undefined の payload から空サマリ', () => {
    expect(summarizeGiftSubAppHistory(null)).toEqual({
      historyCount: 0,
      uniqueItemCount: 0,
      uniqueSenderCount: 0,
      totalPoints: 0,
      hasData: false
    });
    expect(summarizeGiftSubAppHistory(undefined)).toEqual({
      historyCount: 0,
      uniqueItemCount: 0,
      uniqueSenderCount: 0,
      totalPoints: 0,
      hasData: false
    });
  });

  it('history のみ：historyCount / uniqueSenderCount / totalPoints を集計', () => {
    const r = summarizeGiftSubAppHistory({
      history: [
        { itemName: 'A', senderName: 'u1', points: 100 },
        { itemName: 'B', senderName: 'u2', points: 200 },
        { itemName: 'A', senderName: 'u1', points: 100 }
      ],
      totalCounts: []
    });
    expect(r.historyCount).toBe(3);
    expect(r.uniqueSenderCount).toBe(2);
    expect(r.totalPoints).toBe(400);
    expect(r.hasData).toBe(true);
  });

  it('totalCounts のみ：uniqueItemCount を採用', () => {
    const r = summarizeGiftSubAppHistory({
      history: [],
      totalCounts: [
        { itemName: 'A', count: 1 },
        { itemName: 'B', count: 11 },
        { itemName: 'C', count: 3 }
      ]
    });
    expect(r.uniqueItemCount).toBe(3);
    expect(r.hasData).toBe(true);
  });

  it('history と totalCounts 両方：それぞれの集計を独立に', () => {
    const r = summarizeGiftSubAppHistory({
      history: [
        { itemName: 'A', senderName: 'u1', points: 100 },
        { itemName: 'A', senderName: 'u2', points: 100 }
      ],
      totalCounts: [
        { itemName: 'A', count: 2 },
        { itemName: 'B', count: 5 }
      ]
    });
    expect(r.historyCount).toBe(2);
    expect(r.uniqueSenderCount).toBe(2);
    expect(r.uniqueItemCount).toBe(2);
    expect(r.totalPoints).toBe(200);
  });

  it('壊れたフィールドがあっても落ちない（防御）', () => {
    const r = summarizeGiftSubAppHistory({
      history: [
        { itemName: 'A', senderName: 'u', points: 100 },
        { senderName: 'u2' }, // points / itemName 欠
        null,
        'string',
        { points: 'not a number' }
      ],
      totalCounts: 'not array'
    });
    expect(r.historyCount).toBe(5);
    expect(r.totalPoints).toBe(100);
    // senderName が取れた 2 件
    expect(r.uniqueSenderCount).toBe(2);
  });

  it('hasData: history も totalCounts も空なら false', () => {
    const r = summarizeGiftSubAppHistory({ history: [], totalCounts: [] });
    expect(r.hasData).toBe(false);
  });
});

describe('formatGiftSubAppHistorySummaryLabel', () => {
  it('全 0：「未取得」を返す', () => {
    const summary = {
      historyCount: 0,
      uniqueItemCount: 0,
      uniqueSenderCount: 0,
      totalPoints: 0,
      hasData: false
    };
    expect(formatGiftSubAppHistorySummaryLabel(summary)).toContain('未取得');
  });

  it('history と totalCounts 両方ある：件数 / 種類 / 送り主数 を「、」で連結', () => {
    const summary = {
      historyCount: 60,
      uniqueItemCount: 33,
      uniqueSenderCount: 12,
      totalPoints: 100000,
      hasData: true
    };
    const label = formatGiftSubAppHistorySummaryLabel(summary);
    expect(label).toContain('60');
    expect(label).toContain('33');
    expect(label).toContain('12');
  });
});
