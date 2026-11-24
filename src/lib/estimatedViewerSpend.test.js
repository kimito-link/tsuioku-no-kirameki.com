import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ESTIMATED_VIEWER_SPEND_LABEL,
  ESTIMATED_VIEWER_CONSUMPTION_LABEL,
  ESTIMATED_TICKET_BASIS_LABEL,
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
  formatEstimatedViewerSpendDisplay,
  formatEstimatedViewerSpendDisplays
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
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitchSub.sourceUrl).toContain('blog.twitch.tv/en/2017/04/19/');
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitchSub.tierPriceHelpUrl).toContain(
      'help.twitch.tv/s/article/lifetime-subscriber-guide-for-partners'
    );
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitchSub.giftSpecUrl).toContain('help.twitch.tv/s/article/gift-subscriptions');
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitcastingTicketJpy.asOf).toBe('2026-11-24');
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitcastingTicketJpy.sourceUrl).toBe(
      'https://twitcasting.tv/helpcenter.php?pid=HELP_TICKET_ITEM_TABLE'
    );
    expect(ESTIMATED_VIEWER_SPEND_RATES.twitcastingItemPt.asOf).toBe('2026-11-24');
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

    const multi = estimateTwitchSubSpendJpy({ tier1: 1, tier2: 1, tier3: 1, prime: 2 });
    expect(multi?.usd).toBe(39.97);
    expect(estimateTwitchSpendFromComments([primeSub, bitsMsg])).toBeNull();
  });

  it('Twitch: まとめギフト（submysterygift 5件 + 内訳 subgift 5行 giftCount=0）が二重計上されない', () => {
    const mystery = parseTwChatLine(
      '@msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-sub-plan=1000;msg-param-origin-id=orig-99;user-id=10;display-name=Gifter :tmi.twitch.tv USERNOTICE #ch'
    );
    const innerGifts = [1, 2, 3, 4, 5].map((i) =>
      parseTwChatLine(
        `@msg-id=subgift;msg-param-sub-plan=1000;msg-param-community-gift-id=orig-99;msg-param-recipient-display-name=Recv${i};user-id=10;display-name=Gifter :tmi.twitch.tv USERNOTICE #ch`
      )
    );
    expect(mystery?.giftCount).toBe(5);
    for (const g of innerGifts) {
      expect(g?.giftCount).toBe(0);
      expect(g?.giftPartOf).toBe('orig-99');
    }

    // 1) コメント配列からの直接集計（10件ではなく5件=$24.95のみ）
    const rows = [mystery, ...innerGifts];
    const est = estimateTwitchSpendFromComments(rows);
    expect(est?.tierCounts).toEqual({ tier1: 5, tier2: 0, tier3: 0, prime: 0 });
    expect(est?.usd).toBe(24.95);
    expect(est?.jpy).toBe(Math.round(24.95 * (174.35 / 1.0990)));

    // 2) tallySupportItems（横欄・会場チップ）でも二重計上されない
    const tally = tallySupportItems(rows);
    expect(tally.membershipGiftCount).toBe(5);
    expect(tally.subTierCounts).toEqual({ tier1: 5, tier2: 0, tier3: 0, prime: 0 });
    const chip = panelExtraChips('twitch', { support: tally }).find((c) => c.key === 'estimatedViewerSpend');
    expect(chip?.text).toBe(`約¥${Math.round(24.95 * (174.35 / 1.0990)).toLocaleString('ja-JP')}`);

    // 3) ytNicoShim 変換後形式（ytGiftCount: 0, giftPartOf: 'orig-99'）でも二重計上されない
    const shimRows = rows.map((r) => ({
      ytPlatform: 'twitch',
      ytKind: r?.kind,
      subTier: r?.subTier,
      ytGiftCount: r?.giftCount,
      ...(r?.giftPartOf ? { giftPartOf: r.giftPartOf } : {})
    }));
    expect(estimateTwitchSpendFromComments(shimRows)?.usd).toBe(24.95);
  });

  it('ツイキャス: チケット基準の推定（500/1000/3000/5000/10000円）＋お茶爆50/100のpt表示残存、未知有料は件数のみ、無料お茶・お団子は足さない', () => {
    const makeTcGift = (id, name, isPaidGift = true, scoreText = '✨') =>
      parseTcEvent(
        {
          type: 'gift',
          id,
          isPaidGift,
          item: { name, showsSenderInfo: true },
          sender: { id: `c:${id}`, name: id, screenName: `c:${id}` },
          score_items: [{ title: '🍡', text: scoreText }]
        },
        { user: 'caster', nowMs: 1000 }
      );

    const ocha50 = makeTcGift('g50', 'お茶爆50');
    const ocha100 = makeTcGift('g100', 'お茶爆100');
    const ocha300 = makeTcGift('g300', 'お茶爆300');
    const ocha500 = makeTcGift('g500', 'お茶爆500');
    const kiwami1000 = makeTcGift('g1000', '極茶爆1000');
    const freeTea = makeTcGift('gtea', 'お茶ｘ10', true, '20');
    const freeStar = makeTcGift('gstar', '応援スター', false, '90');
    const unknownPaid = makeTcGift('gunk', 'スペシャル花火', true, '✨');

    // 1) お茶爆100×1 + お茶爆50×1 → チケット基準 約¥1,500 ＆ 消費 約1,500pt の両方が表示される
    const est50And100 = estimateTwitcastingSpendFromComments([ocha100, ocha50, freeTea, freeStar]);
    expect(est50And100?.ticketJpy).toBe(1500);
    expect(est50And100?.points).toBe(1500);
    expect(est50And100?.unknownPaidCount).toBe(0);
    const disps50And100 = formatEstimatedViewerSpendDisplays(est50And100);
    expect(disps50And100).toHaveLength(2);
    expect(disps50And100[0].label).toBe(ESTIMATED_TICKET_BASIS_LABEL);
    expect(disps50And100[0].text).toBe('約¥1,500');
    expect(disps50And100[0].note).toContain('ポイント購入・アプリ内課金・オートチャージでは実際の支払と異なる場合');
    expect(disps50And100[0].note).toContain('配信者の受取額ではありません');
    expect(disps50And100[0].sourceUrl).toBe('https://twitcasting.tv/helpcenter.php?pid=HELP_TICKET_ITEM_TABLE');
    expect(disps50And100[1].label).toBe(ESTIMATED_VIEWER_CONSUMPTION_LABEL);
    expect(disps50And100[1].text).toBe('約1,500pt');

    // 2) 5種すべて（500 + 1,000 + 3,000 + 5,000 + 10,000 = 19,500円、pt はお茶爆50/100分の1,500ptのみ）
    const estAll5 = estimateTwitcastingSpendFromComments([ocha50, ocha100, ocha300, ocha500, kiwami1000, freeTea, freeStar]);
    expect(estAll5?.ticketJpy).toBe(19500);
    expect(estAll5?.points).toBe(1500);
    expect(estAll5?.unknownPaidCount).toBe(0);
    const dispsAll5 = formatEstimatedViewerSpendDisplays(estAll5);
    expect(dispsAll5[0]).toMatchObject({ label: 'チケット基準の推定', text: '約¥19,500' });
    expect(dispsAll5[1]).toMatchObject({ label: '推定（視聴者の消費）', text: '約1,500pt' });

    // 3) お茶爆300/500/極茶爆1000 のみ（pt確認対象外）→ チケット基準の円のみ出て、勝手なptは作らない
    const est300Only = estimateTwitcastingSpendFromComments([ocha300, kiwami1000]);
    expect(est300Only?.ticketJpy).toBe(13000);
    expect(est300Only?.points).toBe(0);
    const disps300Only = formatEstimatedViewerSpendDisplays(est300Only);
    expect(disps300Only).toHaveLength(1);
    expect(disps300Only[0]).toMatchObject({ label: 'チケット基準の推定', text: '約¥13,000' });

    // 4) 未知の有料アイテム混在 → 円にもptにも足さず「ほか 1件は金額不明」
    const estMixed = estimateTwitcastingSpendFromComments([ocha100, unknownPaid, freeTea, freeStar]);
    const dispsMixed = formatEstimatedViewerSpendDisplays(estMixed);
    expect(dispsMixed[0].text).toBe('約¥1,000（ほか 1件は金額不明）');
    expect(dispsMixed[1].text).toBe('約1,000pt');

    // 5) 未知の有料アイテムだけ → 件数のみ出す
    const estUnknownOnly = estimateTwitcastingSpendFromComments([unknownPaid, freeTea, freeStar]);
    const dispsUnknown = formatEstimatedViewerSpendDisplays(estUnknownOnly);
    expect(dispsUnknown).toHaveLength(1);
    expect(dispsUnknown[0]).toMatchObject({ label: 'チケット基準の推定', text: 'ほか 1件は金額不明' });

    // 6) 無料お茶・お団子スコアのみ → null（出さない）
    expect(estimateTwitcastingSpendFromComments([freeTea, freeStar])).toBeNull();
    expect(estimateTwitcastingConsumptionPt({ ticketJpy: 0, confirmedPt: 0, unknownPaidCount: 0 })).toBeNull();
  });

  it('会場と横欄のチップは対象5サービス（該当イベントあり時）のみに出し、Bits/Kicks単体や対象外サービスには出さない', () => {
    const ytSupport = tallySupportItems([
      { kind: 'superchat', amount: 1000, currency: 'JPY', recordedAt: 1000 },
      { kind: 'sticker', amount: 5, currency: 'USD', recordedAt: 2000 }
    ]);
    expect(panelExtraChips('youtube', { support: ytSupport }).find((c) => c.key === 'estimatedViewerSpend')?.label).toBe(
      '推定（視聴者の購入額）'
    );

    const twBitsOnly = tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'BITS', recordedAt: 1000 }]);
    expect(panelExtraChips('twitch', { support: twBitsOnly }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);

    const kkKicksOnly = tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'KICKS', recordedAt: 1000 }]);
    expect(panelExtraChips('kick', { support: kkKicksOnly }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);

    // ツイキャス: チケット基準の推定（円）と 推定（視聴者の消費）（pt）の両チップが横欄・会場に出る
    const tcSupport = tallySupportItems([
      { kind: 'superchat', currency: 'TCSCORE', giftName: 'お茶爆100', badges: ['paid'], amount: 0 },
      { kind: 'superchat', currency: 'TCSCORE', giftName: 'お茶爆500', badges: ['paid'], amount: 0 }
    ]);
    const tcChips = panelExtraChips('twitcasting', { support: tcSupport });
    expect(tcChips.find((c) => c.key === 'estimatedViewerSpend')).toMatchObject({
      label: 'チケット基準の推定',
      text: '約¥6,000'
    });
    expect(tcChips.find((c) => c.key === 'estimatedViewerConsumption')).toMatchObject({
      label: '推定（視聴者の消費）',
      text: '約1,000pt'
    });

    const tcVenue = venueItemsForPlatform('twitcasting', {
      records: { text: '5', isPlaceholder: false },
      concurrent: { text: '20', isPlaceholder: false },
      streamAge: { text: '10分', isPlaceholder: false },
      facts: { viewers: 20, support: tcSupport }
    });
    expect(tcVenue?.find((i) => i.key === 'estimatedViewerSpend')?.text).toBe('約¥6,000');
    expect(tcVenue?.find((i) => i.key === 'estimatedViewerConsumption')?.text).toBe('約1,000pt');

    for (const excluded of ['showroom', 'mixch', 'tiktok', 'whowatch', 'abema']) {
      const sup = tallySupportItems([{ kind: 'superchat', amount: 1000, currency: 'SRPT' }]);
      expect(panelExtraChips(excluded, { support: sup }).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);
    }

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

  it('マーケレポート HTML にニコ生・YouTube・Kick・Twitch・ツイキャス（チケット基準円＋消費pt）を出し、対象外には出さない', () => {
    const tcComments = [
      { id: 'tc1', liveId: 'lv900000000012', text: 'お茶爆100', userId: 'u1', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'twitcasting', ytKind: 'superchat', ytCurrency: 'TCSCORE', ytGiftName: 'お茶爆100', badges: ['paid'] },
      { id: 'tc2', liveId: 'lv900000000012', text: '極茶爆1000', userId: 'u2', nickname: 'b', capturedAt: 1_700_000_000_000, ytPlatform: 'twitcasting', ytKind: 'superchat', ytCurrency: 'TCSCORE', ytGiftName: '極茶爆1000', badges: ['paid'] }
    ];
    const tcHtml = buildMarketingDashboardHtml(aggregateMarketingReport(tcComments, 'lv900000000012'), {
      platform: 'twitcasting',
      commentsForAnalytics: tcComments
    });
    expect(tcHtml).toContain('チケット基準の推定');
    expect(tcHtml).toContain('約¥11,000');
    expect(tcHtml).toContain('HELP_TICKET_ITEM_TABLE');
    expect(tcHtml).toContain('ポイント購入・アプリ内課金・オートチャージでは実際の支払と異なる場合');
    expect(tcHtml).toContain('推定（視聴者の消費）');
    expect(tcHtml).toContain('約1,000pt');
    expect(tcHtml).not.toContain('手取り');
  });
});
