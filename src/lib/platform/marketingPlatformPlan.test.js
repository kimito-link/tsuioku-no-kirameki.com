import { describe, expect, it } from 'vitest';
import { aggregateMarketingReport, isMarketingSupportRow, speechCommentsForMarketing } from '../marketingAggregate.js';
import { marketingViewFor } from './marketingPlatformPlan.js';
import { platformCapability } from './platformMetrics.js';
import { sectionPlatformDedicatedHtml, sectionStreamerMomentsHtml } from './marketingPlatformChapters.js';

describe('marketingViewFor', () => {
  it('ニコ生と未指定は null', () => {
    expect(marketingViewFor(undefined)).toBe(null);
    expect(marketingViewFor('')).toBe(null);
    expect(marketingViewFor('niconico')).toBe(null);
  });

  it('TikTok は能力表にあり、視聴者数と書く', () => {
    expect(platformCapability('tiktok').concurrentLabel).toBe('視聴者数');
    expect(platformCapability('tiktok').visitorCard).toBe(false);
    const view = marketingViewFor('tiktok');
    expect(view?.id).toBe('tiktok');
    expect(view?.concurrentLabel).toBe('視聴者数');
    expect(view?.hide.has('mkt-ad-observed')).toBe(true);
    expect(view?.hide.has('mkt-vpos')).toBe(true);
  });

  it('ABEMA はギフトの章を出さない', () => {
    const view = marketingViewFor('abema');
    expect(view?.hideGift).toBe(true);
    expect(view?.hide.has('mkt-gift-ledger')).toBe(true);
    expect(view?.pageCountLabel).toContain('ページの数');
    expect(view?.concurrentHeading).toBe('視聴数の推移');
  });

  it('YouTube の円換算は推定と書く', () => {
    expect(marketingViewFor('youtube')?.pointColumn).toBe('円換算（推定）');
    expect(marketingViewFor('youtube')?.pointEstimate).toBe(true);
  });
});

describe('応援の行', () => {
  it('ytKind が無い行は発言のまま', () => {
    const rows = [{ text: 'a', ytKind: '' }, { text: 'b' }];
    expect(isMarketingSupportRow(rows[0])).toBe(false);
    expect(speechCommentsForMarketing(rows)).toBe(rows);
  });

  it('レイドはコメント数に入れない', () => {
    const comments = [
      { id: '1', liveId: 'lv1', text: 'hello', userId: '1', capturedAt: 1, ytKind: 'text' },
      { id: '2', liveId: 'lv1', text: 'レイド', userId: '2', capturedAt: 2, ytKind: 'tw_raid' },
    ];
    const report = aggregateMarketingReport(comments, 'lv1');
    expect(report.totalComments).toBe(1);
    expect(report.supportRows).toHaveLength(1);
    const speech = speechCommentsForMarketing(comments);
    expect(speech).toHaveLength(1);
    expect(speech[0].id).toBe('1');
  });
});

describe('サービスごとの記録の章', () => {
  it('ニコ生の view が無いときは空', () => {
    expect(sectionPlatformDedicatedHtml([{ ytKind: 'superchat', ytAmount: 1, ytCurrency: 'JPY' }], /** @type {never} */ (null), 0)).toBe('');
  });

  it('記録にある kind とページの数だけ出す', () => {
    const tw = sectionPlatformDedicatedHtml([
      { ytKind: 'tw_milestone', ytAmount: 12, text: '12回', userId: '1' },
      { ytKind: 'membership', subEvent: 'resub', subMonths: 8, subTier: 'Tier 1', text: 'sub', userId: '2' },
      { ytKind: 'membership_gift', ytGiftCount: 5, subTier: 'Tier 1', text: 'gift', userId: '3' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('twitch')), 0);
    expect(tw).toContain('連続視聴の記念');
    expect(tw).toContain('1件（12回）');
    expect(tw).toContain('継続のサブスク');
    expect(tw).toContain('Tier 1');
    expect(tw).toContain('贈った件数（記録）');
    expect(tw).toContain('5件');
    expect(tw).not.toContain('フォロー');

    const kick = sectionPlatformDedicatedHtml([
      { ytKind: 'membership_gift', giftRecipients: ['viewer-a', 'viewer-b'], text: 'gift', userId: '4' },
      { ytKind: 'kk_reward', text: 'reward', userId: '5' },
      { ytKind: 'superchat', ytAmount: 20, ytCurrency: 'KICKS', userId: '6' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('kick')), 0);
    expect(kick).toContain('受け取った人（記録にある名前）');
    expect(kick).toContain('viewer-a');
    expect(kick).toContain('リワード');
    expect(kick).toContain('Kicks の合計（記録）');
    expect(kick).not.toContain('フォロー');

    const mx = sectionPlatformDedicatedHtml([
      { ytKind: 'mx_fan', text: 'ファン登録', userId: '7' },
      { ytKind: 'superchat', ytAmount: 300, ytCurrency: 'MXCOIN', ytGiftName: 'ギフト', userId: '8' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('mixch')), 0, { official: { level: 12, fans: 40 } });
    expect(mx).toContain('ファン登録');
    expect(mx).toContain('コインの単位は未確認です');
    expect(mx).toContain('ページのレベル');
    expect(mx).toContain('ページのファン');

    const ww = sectionPlatformDedicatedHtml([
      { ytKind: 'text', badges: ['saved-type'], text: 'hi', userId: '9' },
      { ytKind: 'superchat', ytAmount: 2, ytCurrency: 'WWITEM', ytGiftName: '星', userId: '10' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('whowatch')), 0, { official: { eventRank: 4, eventName: '春のイベント' } });
    expect(ww).toContain('コメントの種類（記録）');
    expect(ww).toContain('saved-type');
    expect(ww).toContain('星 ×1');
    expect(ww).toContain('ページのイベント順位');

    const yt = sectionPlatformDedicatedHtml([
      { ytKind: 'yt_gift', ytGiftName: 'ジュエル', text: 'gift', userId: '11' },
      { ytKind: 'text', badges: ['member'], text: 'hi', userId: '12' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('youtube')), 0);
    expect(yt).toContain('新しいギフト');
    expect(yt).toContain('ジュエル');
    expect(yt).toContain('メンバーの印');

    const tt = sectionPlatformDedicatedHtml([
      { ytKind: 'superchat', ytAmount: 7, ytCurrency: 'TTCOIN', ytGiftName: 'バラ', userId: '13' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('tiktok')), 0);
    expect(tt).toContain('コイン（記録）');
    expect(tt).toContain('バラ ×1');
    expect(tt).not.toContain('フォロー');

    const tc = sectionPlatformDedicatedHtml([
      { ytKind: 'superchat', ytAmount: 3, ytCurrency: 'TCSCORE', ytGiftName: '団子', userId: '14' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('twitcasting')), 80);
    expect(tc).toContain('スコア（記録）');
    expect(tc).toContain('累計（ページの数）');

    const sr = sectionPlatformDedicatedHtml([
      { ytKind: 'superchat', ytAmount: 100, ytCurrency: 'SRPT', ytGiftName: '花', userId: '15' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('showroom')), 0, { official: { eventRank: 2, eventPoint: 900, questLevel: 3, questPoint: 10, questGoal: 20 } });
    expect(sr).toContain('ギフトpt（記録）');
    expect(sr).toContain('ページのイベントpt');
    expect(sr).toContain('ページの目標');

    const ab = sectionPlatformDedicatedHtml([
      { ytKind: 'text', text: 'hi', userId: '16' },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('abema')), 1200, { commentCount: 80 });
    expect(ab).toContain('視聴数（ページの数）');
    expect(ab).toContain('ページのコメント');
    expect(ab).not.toContain('ギフト');
  });
});

describe('配信の山', () => {
  const T0 = Date.parse('2026-03-01T03:00:00.000Z');

  it('ニコ生の view が無いときは空', () => {
    expect(sectionStreamerMomentsHtml([], /** @type {never} */ (null), [], 0)).toBe('');
  });

  it('記録の時刻と、レイド前後の視聴者数だけ出す', () => {
    const view = /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('twitch'));
    const html = sectionStreamerMomentsHtml([
      { ytKind: 'superchat', ytCurrency: 'BITS', ytAmount: 10, capturedAt: T0 },
      { ytKind: 'superchat', ytCurrency: 'BITS', ytAmount: 50, capturedAt: T0 + 5 * 60_000 },
      { ytKind: 'membership', subEvent: 'resub', capturedAt: T0 + 6 * 60_000 },
      { ytKind: 'tw_hype', text: 'ハイプトレインがレベル2になりました', capturedAt: T0 + 7 * 60_000 },
      { ytKind: 'tw_raid', ytAmount: 42, capturedAt: T0 + 8 * 60_000 },
    ], view, [
      { capturedAt: T0, officialViewerCount: 40 },
      { capturedAt: T0 + 20 * 60_000, officialViewerCount: 55 },
    ], 0);
    expect(html).toContain('Bits 50（この分の記録）');
    expect(html).toContain('継続のサブスク（記録）');
    expect(html).toContain('ハイプトレインがレベル2になりました');
    expect(html).toContain('レイド 42人（記録）');
    expect(html).toContain('直前の視聴者数 40人');
    expect(html).toContain('その後の視聴者数 55人');
    expect(html).toContain('推定（同じ時間の視聴者数。レイドで来た人の残りは記録にありません）');
  });

  it('通貨が違うスーパーチャットは足さない', () => {
    const view = /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('youtube'));
    const html = sectionStreamerMomentsHtml([
      { ytKind: 'text', text: 'わこつ', capturedAt: T0 + 5 * 60_000 },
      { ytKind: 'superchat', ytCurrency: 'USD', ytAmount: 5, capturedAt: T0 + 5 * 60_000 },
      { ytKind: 'superchat', ytCurrency: 'JPY', ytAmount: 100, capturedAt: T0 },
      { ytKind: 'membership', capturedAt: T0 + 2 * 60_000 },
    ], view, [], 0);
    expect(html).toContain('スーパーチャット USD 5（この分の記録）');
    expect(html).toContain('スーパーチャット JPY 100（この分の記録）');
    expect(html).not.toContain('105');
    expect(html).toContain('メンバー（記録）');
    expect(html).toContain('推定（同じ分のコメント 1件・原因とは限らない）');
  });

  it('SHOWROOM はギフトptの山だけで、順位の増え方は出さない', () => {
    const view = /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('showroom'));
    const html = sectionStreamerMomentsHtml([
      { ytKind: 'superchat', ytCurrency: 'SRPT', ytAmount: 30, capturedAt: T0 },
      { ytKind: 'superchat', ytCurrency: 'SRPT', ytAmount: 90, capturedAt: T0 + 60_000 },
    ], view, [], 0);
    expect(html).toContain('ギフトpt 90（この分の記録）');
    expect(html).not.toContain('順位');
    expect(html).not.toContain('推移');
  });

  it('ABEMA はコメントの山と、ページの視聴数を別の数として出す', () => {
    const view = /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('abema'));
    const html = sectionStreamerMomentsHtml([
      { ytKind: 'text', capturedAt: T0 },
      { ytKind: 'text', capturedAt: T0 + 60_000 },
      { ytKind: 'text', capturedAt: T0 + 60_000 },
    ], view, [], 1200);
    expect(html).toContain('コメント 2件（この分の記録）');
    expect(html).toContain('ページの視聴数は 1,200');
    expect(html).toContain('別の数です');
    expect(html).not.toContain('ギフト');
  });

  it('ふわっち・Kick・mixch・TikTok・ツイキャスは記録の山だけ', () => {
    const ww = sectionStreamerMomentsHtml([
      { ytKind: 'superchat', ytCurrency: 'WWITEM', ytAmount: 1, capturedAt: T0 },
      { ytKind: 'superchat', ytCurrency: 'WWITEM', ytAmount: 4, capturedAt: T0 + 60_000 },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('whowatch')), [], 0);
    expect(ww).toContain('アイテム 4（この分の記録）');
    const kick = sectionStreamerMomentsHtml([
      { ytKind: 'superchat', ytCurrency: 'KICKS', ytAmount: 20, capturedAt: T0 },
      { ytKind: 'membership_gift', capturedAt: T0 + 60_000 },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('kick')), [], 0);
    expect(kick).toContain('Kicks 20（この分の記録）');
    expect(kick).toContain('サブスク（記録）');
    const mx = sectionStreamerMomentsHtml([
      { ytKind: 'mx_fan', capturedAt: T0 },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('mixch')), [], 0);
    expect(mx).toContain('ファン登録（記録）');
    const tt = sectionStreamerMomentsHtml([
      { ytKind: 'superchat', ytCurrency: 'TTCOIN', ytAmount: 7, capturedAt: T0 },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('tiktok')), [], 0);
    expect(tt).toContain('コイン 7（この分の記録）');
    expect(tt).not.toContain('フォロー');
    const tc = sectionStreamerMomentsHtml([
      { ytKind: 'superchat', ytCurrency: 'TCSCORE', ytAmount: 0, capturedAt: T0 },
    ], /** @type {NonNullable<ReturnType<typeof marketingViewFor>>} */ (marketingViewFor('twitcasting')), [], 0);
    expect(tc).toContain('金額は記録にありません');
  });
});
