import { describe, it, expect } from 'vitest';
import {
  buildGiftThrowLedgerTableSectionHtml,
  giftThrowRowFromSubAppHistory
} from './giftThrowLedgerTableHtml.js';

describe('giftThrowLedgerTableHtml', () => {
  it('マーケ同型の列（#・時刻・サムネ・ID）を含む', () => {
    const row = giftThrowRowFromSubAppHistory(
      {
        senderName: 'テスト',
        userId: '12345',
        itemName: '乾杯',
        points: 100,
        time: '1:02:03',
        thumbnailUrl: 'https://example.com/item.png',
        senderAvatarUrl: 'https://example.com/av.png'
      },
      'koken-api'
    );
    expect(row).not.toBeNull();
    const html = buildGiftThrowLedgerTableSectionHtml([row], {
      totalCount: 1,
      shownCount: 1,
      payloadSource: 'koken-api'
    });
    expect(html).toContain('nl-gift-ledger-table');
    expect(html).toContain('投げ一覧');
    expect(html).toContain('data-label="#"');
    expect(html).toContain('nl-gift-ledger-row__thumb');
    expect(html).toContain('nl-gift-ledger-thumb');
    expect(html).toContain('12345');
    expect(html).toContain('乾杯');
    expect(html).toContain('koken API');
  });

  it('空行は空文字', () => {
    expect(buildGiftThrowLedgerTableSectionHtml([], { totalCount: 0, shownCount: 0 })).toBe('');
  });
});
