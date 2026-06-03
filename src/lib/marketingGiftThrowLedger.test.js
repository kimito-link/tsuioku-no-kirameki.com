import { describe, it, expect } from 'vitest';
import {
  buildMarketingGiftThrowLedger,
  buildGiftLedgerItemAggregates,
  buildGiftLedgerSenderAggregates,
  giftLedgerSenderKey,
  parseGiftStreamTimeSortKey,
  MARKETING_GIFT_LEDGER_MAX_ROWS
} from './marketingGiftThrowLedger.js';

describe('parseGiftStreamTimeSortKey', () => {
  it('H:M:S を秒に変換', () => {
    expect(parseGiftStreamTimeSortKey('2:45:10')).toBe(2 * 3600 + 45 * 60 + 10);
    expect(parseGiftStreamTimeSortKey('4:16:01')).toBe(4 * 3600 + 16 * 60 + 1);
  });
});

describe('buildGiftLedgerItemAggregates', () => {
  it('totalCounts の回数を採用し history 行数と二重加算しない', () => {
    const agg = buildGiftLedgerItemAggregates(
      [
        {
          itemName: 'かわいい×100',
          points: 10,
          thumbnailUrl: 'https://example.com/gift.png'
        }
      ],
      [{ itemName: 'かわいい×100', count: 32, thumbnailUrl: 'https://example.com/gift.png' }]
    );
    expect(agg[0].count).toBe(32);
    expect(agg[0].points).toBe(10);
  });
});

describe('buildMarketingGiftThrowLedger', () => {
  it('sub-app 履歴から送り主・アイテム・pt の行を作る', () => {
    const ledger = buildMarketingGiftThrowLedger({
      giftSubAppHistory: {
        history: [
          {
            itemName: 'かわいい×100',
            senderName: '名無し',
            points: 10,
            time: '2:45:10',
            thumbnailUrl: 'https://example.com/gift.png'
          }
        ],
        totalCounts: [{ itemName: 'かわいい×100', count: 32, thumbnailUrl: 'https://example.com/gift.png' }]
      }
    });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].senderLabel).toBe('名無し');
    expect(ledger.rows[0].itemName).toBe('かわいい×100');
    expect(ledger.rows[0].points).toBe(10);
    expect(ledger.rows[0].timeLabel).toBe('2:45:10');
    expect(ledger.itemAggregates[0].count).toBe(32);
    expect(ledger.totalPoints).toBe(10);
    expect(ledger.senderAggregates).toHaveLength(1);
    expect(ledger.senderAggregates[0].senderLabel).toBe('名無し');
    expect(ledger.senderChart[0].value).toBe(10);
    expect(ledger.itemChart[0].label).toBe('かわいい×100');
  });

  it('送り主別にアイテム内訳を集計する', () => {
    const rows = [
      { itemName: '花', senderLabel: 'A', userId: '1', points: 100, timeLabel: '1:00:00', source: 'x' },
      { itemName: '花', senderLabel: 'A', userId: '1', points: 100, timeLabel: '1:00:01', source: 'x' },
      { itemName: '星', senderLabel: 'B', userId: '2', points: 50, timeLabel: '1:00:02', source: 'x' }
    ];
    const agg = buildGiftLedgerSenderAggregates(rows);
    expect(agg).toHaveLength(2);
    expect(agg[0].senderLabel).toBe('A');
    expect(agg[0].throwCount).toBe(2);
    expect(agg[0].totalPoints).toBe(200);
    expect(agg[0].items[0].itemName).toBe('花');
    expect(agg[0].items[0].throwCount).toBe(2);
    expect(giftLedgerSenderKey({ userId: '99', senderLabel: 'x' })).toBe('uid:99');
    expect(giftLedgerSenderKey({ userId: '', senderLabel: '名無し' })).toBe('name:名無し');
  });

  it('同一キーは sub-app が DOM より優先', () => {
    const ledger = buildMarketingGiftThrowLedger({
      giftSubAppHistory: {
        history: [
          { itemName: '花', senderName: 'A', points: 100, time: '1:00:00' }
        ]
      },
      officialGiftHistory: [
        {
          giftName: '花',
          advertiserName: 'A',
          point: 100,
          time: '1:00:00'
        }
      ]
    });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].itemName).toBe('花');
    expect(ledger.rows[0].source).toMatch(/sub-app/);
  });

  it('データなしは空行と案内ノート', () => {
    const ledger = buildMarketingGiftThrowLedger({});
    expect(ledger.rows).toHaveLength(0);
    expect(ledger.sourceNotes[0]).toMatch(/未取得/);
  });

  it('koken 公式履歴があるとき NDGR 重複行は台帳に載せない', () => {
    const ledger = buildMarketingGiftThrowLedger({
      giftSubAppHistory: {
        source: 'koken-api',
        history: [
          {
            itemName: 'チョコ',
            senderName: 'A',
            userId: '97561760',
            points: 600,
            time: '0:52:00',
            kokenHistoryId: '99'
          }
        ]
      },
      giftEvents: [
        {
          userId: '97561760',
          nickname: 'A',
          itemName: '',
          point: 600,
          capturedAt: Date.now()
        }
      ]
    });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].source).toMatch(/koken/);
    expect(ledger.sourceNotes.some((n) => n.includes('省略'))).toBe(true);
  });

  it('maxRows で打ち切る', () => {
    const history = [];
    for (let i = 0; i < MARKETING_GIFT_LEDGER_MAX_ROWS + 5; i++) {
      history.push({
        itemName: `item${i}`,
        senderName: `user${i}`,
        points: 10,
        time: `0:0:${String(i % 60).padStart(2, '0')}`
      });
    }
    const ledger = buildMarketingGiftThrowLedger(
      { giftSubAppHistory: { history } },
      { maxRows: 10 }
    );
    expect(ledger.truncated).toBe(true);
    expect(ledger.rows).toHaveLength(10);
    expect(ledger.totalThrows).toBe(MARKETING_GIFT_LEDGER_MAX_ROWS + 5);
  });
});
