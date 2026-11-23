import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ESTIMATED_VIEWER_SPEND_LABEL,
  ESTIMATED_VIEWER_SPEND_RATES,
  jpyPerCurrencyUnit,
  estimateNiconicoGiftSpendJpy,
  estimateYoutubeSupportSpendJpy,
  estimateYoutubeSpendFromComments,
  formatEstimatedViewerSpendDisplay
} from './estimatedViewerSpend.js';
import { panelExtraChips, venueItemsForPlatform, tallySupportItems } from './platform/platformMetrics.js';
import { buildVenueStatStripModel } from './venueStatStrip.js';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';

const ROOT = resolve(process.cwd());

describe('estimatedViewerSpend (L0 単価・日付付き為替・純粋計算)', () => {
  it('価格と為替が日付(YYYY-MM-DD)と出典URL付きで1ファイルにまとまっており、ytGiftToNico.js に依存しない', () => {
    expect(ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt.sourceUrl).toMatch(/^https:\/\//);
    expect(ESTIMATED_VIEWER_SPEND_RATES.fx.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ESTIMATED_VIEWER_SPEND_RATES.fx.sourceUrl).toMatch(/^https:\/\//);
    expect(ESTIMATED_VIEWER_SPEND_RATES.fx.feedUrl).toMatch(/^https:\/\//);

    const src = readFileSync(resolve(ROOT, 'src/lib/estimatedViewerSpend.js'), 'utf8');
    expect(src).not.toContain("from './youtube/ytGiftToNico");
    expect(src).not.toContain('ytAmountToPoints');
  });

  it('ニコ生有料ギフトptを 1pt=1円 で推定し、0/未取得は null', () => {
    const est = estimateNiconicoGiftSpendJpy('6,650pt');
    expect(est).not.toBeNull();
    expect(est?.jpy).toBe(6650);
    expect(est?.platform).toBe('niconico');
    expect(estimateNiconicoGiftSpendJpy(0)).toBeNull();
    expect(estimateNiconicoGiftSpendJpy('—')).toBeNull();
    expect(estimateNiconicoGiftSpendJpy(null)).toBeNull();

    const disp = formatEstimatedViewerSpendDisplay(est);
    expect(disp?.label).toBe(ESTIMATED_VIEWER_SPEND_LABEL);
    expect(disp?.text).toBe('約¥6,650');
    expect(disp?.note).toContain(ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt.asOf);
    expect(disp?.note).not.toContain('手取り');
  });

  it('YouTube スパチャ・ステッカーの円・外貨を ECB 日付付き為替で換算し、非対象単位は除外する', () => {
    const usdRate = jpyPerCurrencyUnit('USD');
    expect(usdRate).not.toBeNull();
    // ytGiftToNico.js の固定 150 ではなく ECB 2026-11-20 (174.35 / 1.0990) を使う
    expect(usdRate).toBeCloseTo(174.35 / 1.0990, 4);

    const est = estimateYoutubeSupportSpendJpy({ JPY: 1000, USD: 10, TWD: 50, BITS: 500 });
    expect(est).not.toBeNull();
    expect(est?.hasFxConversion).toBe(true);
    expect(est?.jpy).toBe(Math.round(1000 + 10 * (174.35 / 1.0990)));
    expect(est?.unconverted).toEqual([{ currency: 'TWD', amount: 50 }]);

    const disp = formatEstimatedViewerSpendDisplay(est);
    expect(disp?.label).toBe('推定（視聴者の購入額）');
    expect(disp?.note).toContain(ESTIMATED_VIEWER_SPEND_RATES.fx.asOf);
    expect(disp?.note).toContain('TWD 50');
    expect(disp?.note).not.toContain('手取り');

    // 他サービスの単位だけは対象外
    expect(estimateYoutubeSupportSpendJpy({ BITS: 1000, KICKS: 500, SRPT: 300 })).toBeNull();
  });

  it('estimateYoutubeSpendFromComments は YouTube の superchat と sticker のみ集計する', () => {
    const est = estimateYoutubeSpendFromComments([
      { ytPlatform: 'youtube', ytKind: 'superchat', ytAmount: 500, ytCurrency: 'JPY' },
      { ytPlatform: 'youtube', ytKind: 'sticker', ytAmount: 200, ytCurrency: 'JPY' },
      { ytPlatform: 'youtube', ytKind: 'membership', ytAmount: 490, ytCurrency: 'JPY' },
      { ytPlatform: 'twitch', ytKind: 'superchat', ytAmount: 100, ytCurrency: 'BITS' }
    ]);
    expect(est?.jpy).toBe(700);
    expect(est?.hasFxConversion).toBe(false);
  });

  it('会場と横欄のチップは YouTube とニコ生だけに出し、他サービスには出さない', () => {
    const ytSupport = tallySupportItems([
      { kind: 'superchat', amount: 1000, currency: 'JPY', recordedAt: 1000 },
      { kind: 'sticker', amount: 5, currency: 'USD', recordedAt: 2000 }
    ]);
    const ytChips = panelExtraChips('youtube', { support: ytSupport });
    const ytEst = ytChips.find((c) => c.key === 'estimatedViewerSpend');
    expect(ytEst?.label).toBe('推定（視聴者の購入額）');
    expect(ytEst?.text).toMatch(/^約¥/);

    const ytVenue = venueItemsForPlatform('youtube', {
      records: { text: '10', isPlaceholder: false },
      concurrent: { text: '50', isPlaceholder: false },
      streamAge: { text: '5分', isPlaceholder: false },
      facts: { viewers: 50, support: ytSupport }
    });
    expect(ytVenue?.some((i) => i.key === 'estimatedViewerSpend')).toBe(true);

    // Twitch / Kick には出さない
    const twSupport = tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'BITS', recordedAt: 1000 }]);
    expect(panelExtraChips('twitch', { support: twSupport }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);
    const kkSupport = tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'KICKS', recordedAt: 1000 }]);
    expect(panelExtraChips('kick', { support: kkSupport }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);

    // ニコ生会場: 有料ギフトpt > 0 のときだけ出る（広告ptのみでは出ない）
    const now = 1_700_000_000_000;
    const nicoWithGift = buildVenueStatStripModel(
      {
        liveId: 'lv123',
        capturedAt: now,
        recordsText: '10',
        recordsIsPlaceholder: false,
        concurrent: { estText: '20', estIsPlaceholder: false, subText: '人' },
        visitor: { text: '100', isPlaceholder: false },
        official: {
          viewers: { text: '100', isPlaceholder: false },
          comments: { text: '10', isPlaceholder: false },
          streamAge: { text: '5分', isPlaceholder: false },
          adPts: { text: '500', isPlaceholder: false },
          giftPts: { text: '1,200', isPlaceholder: false }
        }
      },
      { liveId: 'lv123', nowMs: now }
    );
    const nicoEstItem = nicoWithGift.items.find((i) => i.key === 'estimatedViewerSpend');
    expect(nicoEstItem?.label).toBe('推定（視聴者の購入額）');
    expect(nicoEstItem?.text).toBe('約¥1,200');

    const nicoAdOnly = buildVenueStatStripModel(
      {
        liveId: 'lv123',
        capturedAt: now,
        recordsText: '10',
        recordsIsPlaceholder: false,
        concurrent: { estText: '20', estIsPlaceholder: false, subText: '人' },
        visitor: { text: '100', isPlaceholder: false },
        official: {
          viewers: { text: '100', isPlaceholder: false },
          comments: { text: '10', isPlaceholder: false },
          streamAge: { text: '5分', isPlaceholder: false },
          adPts: { text: '5,000', isPlaceholder: false },
          giftPts: { text: '—', isPlaceholder: true }
        }
      },
      { liveId: 'lv123', nowMs: now }
    );
    expect(nicoAdOnly.items.some((i) => i.key === 'estimatedViewerSpend')).toBe(false);
  });

  it('マーケレポート HTML にニコ生・YouTube のみ推定（視聴者の購入額）と出典URLを出し、Twitch には出さない', () => {
    const baseComments = [
      { id: 'c1', liveId: 'lv1', text: 'hi', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000 }
    ];
    const nicoRep = aggregateMarketingReport(baseComments, 'lv1');
    const nicoHtml = buildMarketingDashboardHtml(nicoRep, {
      commentsForAnalytics: baseComments,
      officialEventDomBundle: { programStats: { giftPoints: 2500, adPoints: 9000 } }
    });
    expect(nicoHtml).toContain('推定（視聴者の購入額）');
    expect(nicoHtml).toContain('約¥2,500');
    expect(nicoHtml).toContain(ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt.sourceUrl);
    expect(nicoHtml).not.toContain('手取り');

    const ytComments = [
      { id: 'y1', liveId: 'lv900000000001', text: 'sc', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'youtube', ytKind: 'superchat', ytAmount: 1000, ytCurrency: 'JPY' }
    ];
    const ytRep = aggregateMarketingReport(ytComments, 'lv900000000001');
    const ytHtml = buildMarketingDashboardHtml(ytRep, { platform: 'youtube', commentsForAnalytics: ytComments });
    expect(ytHtml).toContain('推定（視聴者の購入額）');
    expect(ytHtml).toContain('約¥1,000');
    expect(ytHtml).toContain(ESTIMATED_VIEWER_SPEND_RATES.fx.sourceUrl);
    expect(ytHtml).not.toContain('手取り');

    const twComments = [
      { id: 't1', liveId: 'lv900000000002', text: 'bits', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'twitch', ytKind: 'superchat', ytAmount: 500, ytCurrency: 'BITS' }
    ];
    const twRep = aggregateMarketingReport(twComments, 'lv900000000002');
    const twHtml = buildMarketingDashboardHtml(twRep, { platform: 'twitch', commentsForAnalytics: twComments });
    expect(twHtml).not.toContain('推定（視聴者の購入額）');
  });
});
