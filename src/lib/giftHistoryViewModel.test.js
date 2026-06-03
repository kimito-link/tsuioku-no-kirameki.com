import { describe, it, expect } from 'vitest';
import {
  buildGiftHistoryNorthStarViewModel,
  buildGiftHistoryThrowsTableHtml
} from './giftHistoryViewModel.js';

describe('giftHistoryViewModel', () => {
  it('buildGiftHistoryNorthStarViewModel は送り主集計とマーケ同型の投げ一覧 HTML を返す', () => {
    const vm = buildGiftHistoryNorthStarViewModel({
      history: [
        {
          senderName: 'A',
          userId: '999',
          itemName: '星',
          points: 100,
          time: '1:00'
        },
        {
          senderName: 'B',
          itemName: '花',
          points: 50,
          time: '2:00'
        }
      ],
      source: 'koken-api'
    });
    expect(vm?.senderCount).toBe(2);
    expect(vm?.recentThrows).toHaveLength(2);
    expect(vm?.throwsTableHtml).toContain('投げ一覧');
    expect(vm?.throwsTableHtml).toContain('nl-gift-ledger-table');
    expect(vm?.throwsTableHtml).toContain('nl-gift-ledger-thumb');
  });

  it('buildGiftHistoryThrowsTableHtml は空で空文字', () => {
    expect(buildGiftHistoryThrowsTableHtml([], 0, 0)).toBe('');
  });
});
