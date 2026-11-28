// v0.1.2265: マーケHTMLの応援の呼び方も、会場と同じ公式の言い方に
import { describe, expect, it } from 'vitest';
import { marketingViewFor } from './marketingPlatformPlan.js';
import { sectionPlatformDedicatedHtml } from './marketingPlatformChapters.js';

describe('marketingViewFor: 応援の呼び方', () => {
  it.each([
    ['mixch', 'アイテム', 'コイン'],
    ['twitcasting', 'アイテム', 'スコア'],
    ['whowatch', 'アイテム', '個'],
    ['kick', 'KICKs・サブスク', 'KICKs'],
  ])('%s は giftWord=%s / pointColumn=%s', (id, gift, point) => {
    const v = marketingViewFor(id);
    expect(v?.giftWord).toBe(gift);
    expect(v?.pointColumn).toBe(point);
  });
  it('Kick のマーケHTMLは KICKs(Kicks とは書かない)。通貨コード KICKS はそのまま', () => {
    const comments = [
      { ytKind: 'superchat', ytAmount: 20, ytCurrency: 'KICKS', userId: '6' },
    ];
    const html = sectionPlatformDedicatedHtml(comments, marketingViewFor('kick'), 0);
    expect(html).toContain('KICKs の合計（記録）');
    expect(html).not.toContain('Kicks');
    expect(JSON.stringify(comments)).toContain('KICKS');
  });
  it('ミクチャ・ツイキャスの説明と時刻の見出しは「アイテム」', () => {
    expect(marketingViewFor('mixch')?.awardAllDescription).toContain('コメントやアイテム');
    expect(marketingViewFor('twitcasting')?.awardAllDescription).toContain('コメントやアイテム');
    expect(marketingViewFor('twitcasting')?.moments?.title).toBe('スコアとアイテムの時刻');
    expect(marketingViewFor('kick')?.moments?.title).toBe('KICKs とサブスクの時刻');
  });
});
