import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ESTIMATED_VIEWER_SPEND_LABEL,
  ESTIMATED_VIEWER_CONSUMPTION_LABEL,
  ESTIMATED_VIEWER_SPEND_RATES,
  jpyPerCurrencyUnit,
  estimateNiconicoGiftSpendJpy,
  estimateYoutubeSupportSpendJpy,
  estimateYoutubeSpendFromComments,
  estimateKickSubSpendJpy,
  estimateKickSpendFromComments,
  estimateTwitchSubSpendJpy,
  estimateTwitchSpendFromComments,
  estimateTwitcastingConsumptionPt,
  estimateTwitcastingSpendFromComments,
  formatEstimatedViewerSpendDisplay
} from './estimatedViewerSpend.js';
import { panelExtraChips, venueItemsForPlatform, tallySupportItems } from './platform/platformMetrics.js';
import { buildVenueStatStripModel } from './venueStatStrip.js';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';
import { parseKickEvent } from './kick/kickChatParse.js';
import { parseTwChatLine } from './twitch/twIrcParse.js';
import { parseTcEvent } from './twitcasting/tcParse.js';

const ROOT = resolve(process.cwd());

describe('estimatedViewerSpend (L0 単価・日付付き為替・純粋計算)', () => {
  it('価格と為替が日付(YYYY-MM-DD)と出典URL付きで1ファイルにまとまっており、ytGiftToNico.js に依存しない', () => {
    expect(ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt.sourceUrl).toMatch(/^https:\/\//);
    expect(ESTIMATED_VIEWER_SPEND_RATES.kickSub.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ESTIMATED_VIEWER_SPEND_RATES.kickSub.sourceUrl).toContain('help.kick.com/en/articles/15159735');
    expect(ESTIMATED_VIEWER_SPEND_RATES.kickSub.giftSourceUrl).toContain('help.kick.com/en/articles/15064143');
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitchSub.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitchSub.sourceUrl).toContain('help.twitch.tv/s/article/gift-subscriptions');
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitcastingItemPt.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitcastingItemPt.sourceUrl).toContain('ANNOUNCE_JA_20250715');
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

  it('Kick: サブ3件（通常サブ1＋ギフトサブ2）→ $15 USD を ECB 為替で円換算し、Kicks は足さない', () => {
    const subEv = parseKickEvent({ event: 'SubscriptionEvent', data: { username: 'user_a', months: 1 } }, { nowMs: 1000 });
    const giftEv = parseKickEvent(
      { event: 'GiftedSubscriptionsEvent', data: { gifter_username: 'user_b', gifted_total: 2 } },
      { nowMs: 2000 }
    );
    const kicksEv = parseKickEvent(
      { event: 'KicksGiftedEvent', data: { sender: { id: 10, username: 'user_c', slug: 'user-c' }, gift: { amount: 500, name: 'Star' } } },
      { nowMs: 3000 }
    );
    const est = estimateKickSpendFromComments([subEv, giftEv, kicksEv]);
    expect(est).not.toBeNull();
    expect(est?.platform).toBe('kick');
    expect(est?.usd).toBe(15);
    expect(est?.jpy).toBe(Math.round(15 * (174.35 / 1.0990)));

    const disp = formatEstimatedViewerSpendDisplay(est);
    expect(disp?.label).toBe('推定（視聴者の購入額）');
    expect(disp?.text).toBe(`約¥${Math.round(15 * (174.35 / 1.0990)).toLocaleString('ja-JP')}`);
    expect(disp?.note).not.toContain('手取り');

    // Kicks だけなら null
    expect(estimateKickSpendFromComments([kicksEv])).toBeNull();
    expect(estimateKickSubSpendJpy({ subCount: 0, giftSubCount: 0 })).toBeNull();
  });

  it('Twitch: Tier1×2＋Prime×1 → $9.98 のみ換算し、Prime と Bits は除外、地域別価格・アプリ課金注記を含む', () => {
    const t1Sub = parseTwChatLine(
      '@msg-id=sub;msg-param-sub-plan=1000;msg-param-cumulative-months=1;user-id=1;display-name=A :tmi.twitch.tv USERNOTICE #ch'
    );
    const t1Gift = parseTwChatLine(
      '@msg-id=subgift;msg-param-sub-plan=1000;msg-param-recipient-display-name=B;user-id=2;display-name=C :tmi.twitch.tv USERNOTICE #ch'
    );
    const primeSub = parseTwChatLine(
      '@msg-id=resub;msg-param-sub-plan=Prime;msg-param-cumulative-months=3;user-id=3;display-name=D :tmi.twitch.tv USERNOTICE #ch'
    );
    const bitsMsg = parseTwChatLine(
      '@bits=1000;user-id=4;display-name=E :e!e@e.tmi.twitch.tv PRIVMSG #ch :Cheer1000 nice'
    );

    const est = estimateTwitchSpendFromComments([t1Sub, t1Gift, primeSub, bitsMsg]);
    expect(est).not.toBeNull();
    expect(est?.platform).toBe('twitch');
    expect(est?.usd).toBe(9.98);
    expect(est?.jpy).toBe(Math.round(9.98 * (174.35 / 1.0990)));
    expect(est?.tierCounts).toEqual({ tier1: 2, tier2: 0, tier3: 0, prime: 1 });

    const disp = formatEstimatedViewerSpendDisplay(est);
    expect(disp?.label).toBe('推定（視聴者の購入額）');
    expect(disp?.note).toContain('地域別価格・アプリ課金で実際と異なる場合あり');
    expect(disp?.note).toContain('Prime×1は0として除外');
    expect(disp?.note).not.toContain('手取り');

    // Tier2 / Tier3 の単価確認
    const multi = estimateTwitchSubSpendJpy({ tier1: 1, tier2: 1, tier3: 1, prime: 2 });
    expect(multi?.usd).toBe(39.97);

    // Prime と Bits だけなら null
    expect(estimateTwitchSpendFromComments([primeSub, bitsMsg])).toBeNull();
  });

  it('ツイキャス: お茶爆100×1＋お茶爆50×1 → 約1,500pt、未知有料アイテムは件数だけ、無料お茶・お団子は足さない', () => {
    const ocha100 = parseTcEvent(
      {
        type: 'gift',
        id: 'g1',
        isPaidGift: true,
        item: { name: 'お茶爆100', showsSenderInfo: true },
        sender: { id: 'c:u1', name: 'A', screenName: 'c:u1' },
        score_items: [{ title: '🍡', text: '✨' }]
      },
      { user: 'caster', nowMs: 1000 }
    );
    const ocha50 = parseTcEvent(
      {
        type: 'gift',
        id: 'g2',
        isPaidGift: true,
        item: { name: 'お茶爆50', showsSenderInfo: true },
        sender: { id: 'c:u2', name: 'B', screenName: 'c:u2' },
        score_items: [{ title: '🍡', text: '✨' }]
      },
      { user: 'caster', nowMs: 2000 }
    );
    const freeTea = parseTcEvent(
      {
        type: 'gift',
        id: 'g3',
        isPaidGift: true,
        item: { name: 'お茶ｘ10', showsSenderInfo: true },
        sender: { id: 'c:u3', name: 'C', screenName: 'c:u3' },
        score_items: [{ title: '🍡', text: '20' }]
      },
      { user: 'caster', nowMs: 3000 }
    );
    const freeStar = parseTcEvent(
      {
        type: 'gift',
        id: 'g4',
        isPaidGift: false,
        item: { name: '応援スター', showsSenderInfo: true },
        sender: { id: 'c:u4', name: 'D', screenName: 'c:u4' },
        score_items: [{ title: '🍡', text: '90' }]
      },
      { user: 'caster', nowMs: 4000 }
    );
    const unknownPaid = parseTcEvent(
      {
        type: 'gift',
        id: 'g5',
        isPaidGift: true,
        item: { name: 'スペシャル花火', showsSenderInfo: true },
        sender: { id: 'c:u5', name: 'E', screenName: 'c:u5' },
        score_items: [{ title: '🍡', text: '✨' }]
      },
      { user: 'caster', nowMs: 5000 }
    );

    // お茶爆100×1 + お茶爆50×1 + 無料お茶/応援アイテム → 1,500pt のみ
    const estConfirmed = estimateTwitcastingSpendFromComments([ocha100, ocha50, freeTea, freeStar]);
    expect(estConfirmed?.points).toBe(1500);
    expect(estConfirmed?.jpy).toBe(0);
    expect(estConfirmed?.unknownPaidCount).toBe(0);
    const dispConfirmed = formatEstimatedViewerSpendDisplay(estConfirmed);
    expect(dispConfirmed?.label).toBe(ESTIMATED_VIEWER_CONSUMPTION_LABEL);
    expect(dispConfirmed?.text).toBe('約1,500pt');
    expect(dispConfirmed?.note).not.toContain('手取り');

    // 未知の有料アイテム混在時 → pt は足さず「ほか 1件は金額不明」
    const estMixed = estimateTwitcastingSpendFromComments([ocha100, ocha50, unknownPaid, freeTea, freeStar]);
    expect(estMixed?.points).toBe(1500);
    expect(estMixed?.unknownPaidCount).toBe(1);
    expect(formatEstimatedViewerSpendDisplay(estMixed)?.text).toBe('約1,500pt（ほか 1件は金額不明）');

    // 未知の有料アイテムだけ → 件数だけ出す
    const estUnknownOnly = estimateTwitcastingSpendFromComments([unknownPaid, freeTea, freeStar]);
    expect(estUnknownOnly?.points).toBe(0);
    expect(estUnknownOnly?.unknownPaidCount).toBe(1);
    expect(formatEstimatedViewerSpendDisplay(estUnknownOnly)?.text).toBe('ほか 1件は金額不明');

    // 無料お茶・お団子スコアのみ → null（出さない）
    expect(estimateTwitcastingSpendFromComments([freeTea, freeStar])).toBeNull();
    expect(estimateTwitcastingConsumptionPt({ confirmedPt: 0, unknownPaidCount: 0 })).toBeNull();
  });

  it('会場と横欄のチップは対象5サービス（該当イベントあり時）のみに出し、Bits/Kicks単体や対象外サービスには出さない', () => {
    const ytSupport = tallySupportItems([
      { kind: 'superchat', amount: 1000, currency: 'JPY', recordedAt: 1000 },
      { kind: 'sticker', amount: 5, currency: 'USD', recordedAt: 2000 }
    ]);
    expect(panelExtraChips('youtube', { support: ytSupport }).find((c) => c.key === 'estimatedViewerSpend')?.label).toBe(
      '推定（視聴者の購入額）'
    );

    // Twitch: Bits のみでは出ない、有料サブがあれば出る
    const twBitsOnly = tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'BITS', recordedAt: 1000 }]);
    expect(panelExtraChips('twitch', { support: twBitsOnly }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);
    const twPaidSub = tallySupportItems([
      { kind: 'membership', subTier: 'Tier 1', recordedAt: 1000 },
      { kind: 'membership', subTier: 'Prime', recordedAt: 1500 }
    ]);
    expect(panelExtraChips('twitch', { support: twPaidSub }).find((c) => c.key === 'estimatedViewerSpend')?.text).toBe(
      `約¥${Math.round(4.99 * (174.35 / 1.0990)).toLocaleString('ja-JP')}`
    );

    // Kick: Kicks のみでは出ない、サブがあれば出る
    const kkKicksOnly = tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'KICKS', recordedAt: 1000 }]);
    expect(panelExtraChips('kick', { support: kkKicksOnly }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);
    const kkSub = tallySupportItems([{ kind: 'membership_gift', giftCount: 3, recordedAt: 1000 }]);
    expect(panelExtraChips('kick', { support: kkSub }).find((c) => c.key === 'estimatedViewerSpend')?.text).toBe(
      `約¥${Math.round(15 * (174.35 / 1.0990)).toLocaleString('ja-JP')}`
    );

    // ツイキャス: お茶爆で「推定（視聴者の消費）」が出る
    const tcSupport = tallySupportItems([
      { kind: 'superchat', currency: 'TCSCORE', giftName: 'お茶爆100', badges: ['paid'], amount: 0 },
      { kind: 'superchat', currency: 'TCSCORE', giftName: 'お茶爆50', badges: ['paid'], amount: 0 }
    ]);
    const tcChip = panelExtraChips('twitcasting', { support: tcSupport }).find((c) => c.key === 'estimatedViewerSpend');
    expect(tcChip?.label).toBe('推定（視聴者の消費）');
    expect(tcChip?.text).toBe('約1,500pt');
    const tcVenue = venueItemsForPlatform('twitcasting', {
      records: { text: '5', isPlaceholder: false },
      concurrent: { text: '20', isPlaceholder: false },
      streamAge: { text: '10分', isPlaceholder: false },
      facts: { viewers: 20, support: tcSupport }
    });
    expect(tcVenue?.find((i) => i.key === 'estimatedViewerSpend')?.text).toBe('約1,500pt');

    // SHOWROOM / ミクチャ / TikTok / ふわっち / ABEMA には出さない
    for (const excluded of ['showroom', 'mixch', 'tiktok', 'whowatch', 'abema']) {
      const sup = tallySupportItems([{ kind: 'superchat', amount: 1000, currency: 'SRPT' }]);
      expect(panelExtraChips(excluded, { support: sup }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);
    }

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
    expect(nicoWithGift.items.find((i) => i.key === 'estimatedViewerSpend')?.text).toBe('約¥1,200');
  });

  it('マーケレポート HTML にニコ生・YouTube・Kick・Twitch・ツイキャスの推定を出し、BitsのみやSHOWROOMには出さない', () => {
    const baseComments = [
      { id: 'c1', liveId: 'lv1', text: 'hi', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000 }
    ];
    const nicoHtml = buildMarketingDashboardHtml(aggregateMarketingReport(baseComments, 'lv1'), {
      commentsForAnalytics: baseComments,
      officialEventDomBundle: { programStats: { giftPoints: 2500, adPoints: 9000 } }
    });
    expect(nicoHtml).toContain('推定（視聴者の購入額）');
    expect(nicoHtml).toContain('約¥2,500');

    const kkComments = [
      { id: 'k1', liveId: 'lv900000000010', text: 'ギフトサブ3件', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'kick', ytKind: 'membership_gift', ytGiftCount: 3 }
    ];
    const kkHtml = buildMarketingDashboardHtml(aggregateMarketingReport(kkComments, 'lv900000000010'), {
      platform: 'kick',
      commentsForAnalytics: kkComments
    });
    expect(kkHtml).toContain('推定（視聴者の購入額）');
    expect(kkHtml).toContain(ESTIMATED_VIEWER_SPEND_RATES.kickSub.sourceUrl);

    const twSubComments = [
      { id: 'tw1', liveId: 'lv900000000011', text: 'sub', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'twitch', ytKind: 'membership', subTier: 'Tier 1' }
    ];
    const twSubHtml = buildMarketingDashboardHtml(aggregateMarketingReport(twSubComments, 'lv900000000011'), {
      platform: 'twitch',
      commentsForAnalytics: twSubComments
    });
    expect(twSubHtml).toContain('推定（視聴者の購入額）');
    expect(twSubHtml).toContain('地域別価格・アプリ課金で実際と異なる場合あり');

    const tcComments = [
      { id: 'tc1', liveId: 'lv900000000012', text: 'お茶爆100', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'twitcasting', ytKind: 'superchat', ytCurrency: 'TCSCORE', ytGiftName: 'お茶爆100', badges: ['paid'] }
    ];
    const tcHtml = buildMarketingDashboardHtml(aggregateMarketingReport(tcComments, 'lv900000000012'), {
      platform: 'twitcasting',
      commentsForAnalytics: tcComments
    });
    expect(tcHtml).toContain('推定（視聴者の消費）');
    expect(tcHtml).toContain('約1,000pt');

    // Bits のみの Twitch は出さない
    const twBitsOnly = [
      { id: 't1', liveId: 'lv900000000002', text: 'bits', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'twitch', ytKind: 'superchat', ytAmount: 500, ytCurrency: 'BITS' }
    ];
    const twBitsHtml = buildMarketingDashboardHtml(aggregateMarketingReport(twBitsOnly, 'lv900000000002'), {
      platform: 'twitch',
      commentsForAnalytics: twBitsOnly
    });
    expect(twBitsHtml).not.toContain('推定（視聴者の購入額）');
  });
});
