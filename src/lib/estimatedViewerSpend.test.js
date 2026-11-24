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
  estimateMixchCoinSpendJpy,
  estimateMixchSpendFromComments,
  estimateTiktokCoinSpendJpy,
  estimateTiktokSpendFromComments,
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
import { parseMxMessage } from './mixch/mxParse.js';
import { parseTtGift, parseTtChat, parseTtSocialFollow, ttGiftRow, createTtComboTracker } from './tiktok/ttParse.js';
import { exportCommentsFromStoredRows } from './youtube/exportStoredComments.js';

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
    expect(ESTIMATED_VIEWER_SPEND_RATES.mixchCoin.jpyPerCoin).toBe(1.2);
    expect(ESTIMATED_VIEWER_SPEND_RATES.mixchCoin.packCoins).toBe(400);
    expect(ESTIMATED_VIEWER_SPEND_RATES.mixchCoin.packJpy).toBe(480);
    expect(ESTIMATED_VIEWER_SPEND_RATES.mixchCoin.asOf).toBe('2026-11-24');
    expect(ESTIMATED_VIEWER_SPEND_RATES.mixchCoin.sourceUrl).toBe('https://mixch.tv/charge/coin?paidy');
    expect(ESTIMATED_VIEWER_SPEND_RATES.tiktokCoin.jpyPerCoin).toBeCloseTo(56 / 30, 8);
    expect(ESTIMATED_VIEWER_SPEND_RATES.tiktokCoin.packCoins).toBe(30);
    expect(ESTIMATED_VIEWER_SPEND_RATES.tiktokCoin.packJpy).toBe(56);
    expect(ESTIMATED_VIEWER_SPEND_RATES.tiktokCoin.asOf).toBe('2026-11-24');
    expect(ESTIMATED_VIEWER_SPEND_RATES.tiktokCoin.sourceUrl).toBe('https://www.tiktok.com/coin');
    expect(ESTIMATED_VIEWER_SPEND_RATES.fx.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ESTIMATED_VIEWER_SPEND_RATES.fx.sourceUrl).toMatch(/^https:\/\//);
    expect(ESTIMATED_VIEWER_SPEND_RATES.fx.feedUrl).toMatch(/^https:\/\//);

    const src = readFileSync(resolve(ROOT, 'src/lib/estimatedViewerSpend.js'), 'utf8');
    expect(src).not.toContain("from './youtube/ytGiftToNico");
    expect(src).not.toContain('ytAmountToPoints');
    expect(src).toContain('VIP の銀行振込・LINE Pay は別価格');
    expect(src).toContain('キャンペーンの無料コインは含めない');
    expect(src).toContain('ログイン後のみ表示');
    expect(src).toContain('アプリ内課金は別価格');
    expect(src).toContain('配信者の受取額（ダイヤ）ではない');
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

  it('ミクチャ（mixch）: 400コイン → 480円（推定（視聴者の消費）約¥480）、未知のギフトは件数のみ、通常コメント・ファン登録は含めない', async () => {
    const items = new Map([
      ['501', { price: 200, resourceId: 1, imageUrl: '' }]
    ]);
    // 200コイン × 2個 = 400コイン → 480円
    const knownGift = parseMxMessage(
      { kind: 42, message_id: 'm-known', user_id: 13, name: 'ギフトさん', item_id: 501, count: 2, created: 1000 },
      { userId: '999', items, nowMs: 1_000_000 }
    );
    // items 一覧にも item_price にも無い未知ギフト → amount=0, kind='text', giftName='ギフト'
    const unknownGift = parseMxMessage(
      { kind: 45, message_id: 'm-unk', user_id: 14, name: 'ふしぎ', item_id: 9999, count: 1, created: 1001 },
      { userId: '999', items, nowMs: 1_001_000 }
    );
    const textComment = parseMxMessage(
      { kind: 0, message_id: 'm-txt', user_id: 15, name: 'リスナー', body: 'わこつ', created: 1002 },
      { userId: '999', items, nowMs: 1_002_000 }
    );
    const fanFollow = parseMxMessage(
      { kind: 62, message_id: 'm-fan', user_id: 16, name: 'ファン', body: 'ファンになりました', created: 1003 },
      { userId: '999', items, nowMs: 1_003_000 }
    );

    // 1) 400コイン → 480円
    const est400 = estimateMixchSpendFromComments([knownGift, textComment, fanFollow]);
    expect(est400).not.toBeNull();
    expect(est400?.platform).toBe('mixch');
    expect(est400?.coins).toBe(400);
    expect(est400?.jpy).toBe(480);
    expect(est400?.unknownPaidCount).toBe(0);

    const disp400 = formatEstimatedViewerSpendDisplay(est400);
    expect(disp400?.label).toBe('推定（視聴者の消費）');
    expect(disp400?.text).toBe('約¥480');
    expect(disp400?.sourceUrl).toBe('https://mixch.tv/charge/coin?paidy');
    expect(disp400?.asOf).toBe('2026-11-24');
    // 禁止語チェック（紹介・有料・LINE・サポーター・手取りをUI文言に入れない）
    for (const field of [disp400?.label, disp400?.text, disp400?.title, disp400?.note]) {
      expect(field).not.toMatch(/紹介|有料|LINE|サポーター|手取り/);
    }

    // 2) 未知のギフトのみ → 円換算せず件数のみ
    const estUnkOnly = estimateMixchSpendFromComments([unknownGift, textComment, fanFollow]);
    expect(estUnkOnly?.coins).toBe(0);
    expect(estUnkOnly?.jpy).toBe(0);
    expect(estUnkOnly?.unknownPaidCount).toBe(1);
    const dispUnkOnly = formatEstimatedViewerSpendDisplay(estUnkOnly);
    expect(dispUnkOnly?.label).toBe('推定（視聴者の消費）');
    expect(dispUnkOnly?.text).toBe('ほか 1件は金額不明');
    expect(dispUnkOnly?.note).not.toMatch(/紹介|有料|LINE|サポーター|手取り/);

    // 3) 400コイン + 未知ギフト混在（exportStoredComments 経由でも同じ結果）
    const exported = await exportCommentsFromStoredRows(
      [
        { ...knownGift, recordedAt: 1_000_000 },
        { ...unknownGift, recordedAt: 1_001_000 },
        { ...textComment, recordedAt: 1_002_000 },
        { ...fanFollow, recordedAt: 1_003_000 }
      ],
      'lv900000000088',
      async () => {}
    );
    const estMixed = estimateMixchSpendFromComments(exported);
    expect(estMixed?.coins).toBe(400);
    expect(estMixed?.jpy).toBe(480);
    expect(estMixed?.unknownPaidCount).toBe(1);
    expect(formatEstimatedViewerSpendDisplay(estMixed)?.text).toBe('約¥480（ほか 1件は金額不明）');

    // 4) 通常コメント・ファン登録のみ → null
    expect(estimateMixchSpendFromComments([textComment, fanFollow])).toBeNull();
    expect(estimateMixchCoinSpendJpy({ coins: 0, unknownGiftCount: 0 })).toBeNull();
  });

  it('TikTok LIVE: 30コイン → 56円（推定（視聴者の消費）約¥56）、コンボ1回分を二重に数えない、コイン不明は件数のみ', async () => {
    const enc = new TextEncoder();
    const varint = (v) => {
      let x = BigInt(v);
      const out = [];
      do {
        let b = Number(x & 0x7fn);
        x >>= 7n;
        if (x) b |= 0x80;
        out.push(b);
      } while (x);
      return out;
    };
    const fv = (no, v) => [...varint((no << 3) | 0), ...varint(v)];
    const fb = (no, b) => {
      const bytes = typeof b === 'string' ? [...enc.encode(b)] : [...b];
      return [...varint((no << 3) | 2), ...varint(bytes.length), ...bytes];
    };
    const av = 'https://p16-sign-sg.tiktokcdn.com/aweme/100x100/a.webp';
    const gimg = 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/rose.png~tplv-obj.webp';
    const ttUser = (id, nick, unique) => [...fv(1, BigInt(id)), ...fb(3, nick), ...fb(9, fb(1, av)), ...fb(38, unique)];
    const ttCommon = (ms) => fb(1, fv(4, ms));
    const buildGiftBuf = ({ giftId, count, end = false, group = 777, type = 1, diamond = 10, en = 'FingerHeart', uid = '21' }) =>
      new Uint8Array([
        ...ttCommon(1_762_640_002_000),
        ...fv(2, giftId),
        ...(end ? [] : fv(3, 1)),
        ...fv(5, count),
        ...fb(7, ttUser(uid, 'おくりて', 'giver')),
        ...(end ? fv(9, 1) : []),
        ...fv(11, group),
        ...fb(
          15,
          [
            ...fb(1, fb(1, gimg)),
            ...fv(5, giftId),
            ...fv(11, type),
            ...(diamond > 0 ? fv(12, diamond) : []),
            ...fb(16, en)
          ]
        )
      ]);

    // 1) コンボ（単価10コイン × 1→2→3連打終了 + 遅延重複フレーム）→ createTtComboTracker で3個分(30コイン=56円)を1回だけ計上
    const combo = createTtComboTracker({ waitMs: 8000 });
    const gStep1 = parseTtGift(buildGiftBuf({ giftId: 5655, count: 1, end: false, group: 777, diamond: 10 }));
    const gStep2 = parseTtGift(buildGiftBuf({ giftId: 5655, count: 2, end: false, group: 777, diamond: 10 }));
    const gStep3End = parseTtGift(buildGiftBuf({ giftId: 5655, count: 3, end: true, group: 777, diamond: 10 }));
    const gLateDup = parseTtGift(buildGiftBuf({ giftId: 5655, count: 3, end: true, group: 777, diamond: 10 }));

    expect(combo.push(/** @type {any} */ (gStep1), 0)).toEqual([]);
    expect(combo.push(/** @type {any} */ (gStep2), 100)).toEqual([]);
    const emitted = combo.push(/** @type {any} */ (gStep3End), 200);
    expect(emitted).toHaveLength(1);
    expect(combo.push(/** @type {any} */ (gLateDup), 300)).toEqual([]);

    const finalComboRow = ttGiftRow(emitted[0], 'host.user');
    const chatRow = parseTtChat(
      new Uint8Array([...ttCommon(1_762_640_003_000), ...fb(2, ttUser('31', 'リスナー', 'fan1')), ...fb(3, 'すごい')]),
      { msgId: '9001', uniqueId: 'host.user', nowMs: 1_762_640_003_000 }
    );
    const followRow = parseTtSocialFollow(
      new Uint8Array([...ttCommon(1_762_640_004_000), ...fb(2, ttUser('32', 'フォロワー', 'fan2')), ...fb(8, 'フォローしました')]),
      { msgId: '9002', uniqueId: 'host.user', nowMs: 1_762_640_004_000 }
    );

    const est30 = estimateTiktokSpendFromComments([finalComboRow, chatRow, followRow]);
    expect(est30).not.toBeNull();
    expect(est30?.platform).toBe('tiktok');
    expect(est30?.coins).toBe(30);
    expect(est30?.jpy).toBe(56);
    expect(est30?.unknownPaidCount).toBe(0);

    const disp30 = formatEstimatedViewerSpendDisplay(est30);
    expect(disp30?.label).toBe('推定（視聴者の消費）');
    expect(disp30?.text).toBe('約¥56');
    expect(disp30?.sourceUrl).toBe('https://www.tiktok.com/coin');
    expect(disp30?.asOf).toBe('2026-11-24');
    for (const field of [disp30?.label, disp30?.text, disp30?.title, disp30?.note]) {
      expect(field).not.toMatch(/紹介|有料|LINE|サポーター|手取り/);
    }

    // 2) 万一 同一コンボ groupId の途中行(10コイン・20コイン)と最終行(30コイン)が配列に混在しても二重計上しない
    const midRow1 = ttGiftRow(/** @type {any} */ (gStep1), 'host.user');
    const midRow2 = ttGiftRow(/** @type {any} */ (gStep2), 'host.user');
    const estDedup = estimateTiktokSpendFromComments([midRow1, midRow2, finalComboRow]);
    expect(estDedup?.coins).toBe(30);
    expect(estDedup?.jpy).toBe(56);
    const tallyDedup = tallySupportItems([midRow1, midRow2, finalComboRow]);
    expect(tallyDedup.ttConsumption.coins).toBe(30);

    // 3) コイン数不明のギフト（diamond=0 かつ gift/list 未掲載）→ 円換算せず件数のみ
    const gUnknown = parseTtGift(buildGiftBuf({ giftId: 9999, count: 1, end: true, group: 888, type: 2, diamond: 0, en: 'MysteryBox' }));
    const unknownRow = ttGiftRow(/** @type {any} */ (gUnknown), 'host.user');
    expect(unknownRow.amount).toBe(0);
    const estUnkOnly = estimateTiktokSpendFromComments([unknownRow, chatRow, followRow]);
    expect(estUnkOnly?.coins).toBe(0);
    expect(estUnkOnly?.jpy).toBe(0);
    expect(estUnkOnly?.unknownPaidCount).toBe(1);
    expect(formatEstimatedViewerSpendDisplay(estUnkOnly)?.text).toBe('ほか 1件は金額不明');

    // 4) 30コイン + コイン不明ギフト1件（exportStoredComments 経由）
    const exported = await exportCommentsFromStoredRows(
      [
        { ...finalComboRow, recordedAt: 1_000_000 },
        { ...unknownRow, recordedAt: 1_001_000 },
        { ...chatRow, recordedAt: 1_002_000 },
        { ...followRow, recordedAt: 1_003_000 }
      ],
      'lv900000000099',
      async () => {}
    );
    const estMixed = estimateTiktokSpendFromComments(exported);
    expect(estMixed?.coins).toBe(30);
    expect(estMixed?.jpy).toBe(56);
    expect(estMixed?.unknownPaidCount).toBe(1);
    expect(formatEstimatedViewerSpendDisplay(estMixed)?.text).toBe('約¥56（ほか 1件は金額不明）');

    // 5) 通常コメント・フォロー通知のみ → null
    expect(estimateTiktokSpendFromComments([chatRow, followRow])).toBeNull();
    expect(estimateTiktokCoinSpendJpy({ coins: 0, unknownGiftCount: 0 })).toBeNull();
  });

  it('会場と横欄のチップは対象7サービス（該当イベントあり時）のみに出し、Bits/Kicks単体や対象外サービスには出さない', () => {
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

    // ミクチャ: 400コイン + 未知ギフト1件 → 推定（視聴者の消費）約¥480（ほか 1件は金額不明）が横欄・会場に出る
    const mxSupport = tallySupportItems([
      { kind: 'superchat', channelId: 'mx:13', currency: 'MXCOIN', amount: 400, giftName: 'ギフト' },
      { kind: 'text', channelId: 'mx:14', currency: '', amount: 0, giftName: 'ギフト' }
    ]);
    const mxChips = panelExtraChips('mixch', { support: mxSupport });
    expect(mxChips.find((c) => c.key === 'estimatedViewerSpend')).toMatchObject({
      label: '推定（視聴者の消費）',
      text: '約¥480（ほか 1件は金額不明）'
    });
    const mxVenue = venueItemsForPlatform('mixch', {
      records: { text: '4', isPlaceholder: false },
      concurrent: { text: '30', isPlaceholder: false },
      streamAge: { text: '12分', isPlaceholder: false },
      facts: { viewers: 30, support: mxSupport }
    });
    expect(mxVenue?.find((i) => i.key === 'estimatedViewerSpend')).toMatchObject({
      label: '推定（視聴者の消費）',
      text: '約¥480（ほか 1件は金額不明）'
    });

    // TikTok LIVE: 30コイン + 未知ギフト1件 → 推定（視聴者の消費）約¥56（ほか 1件は金額不明）が横欄・会場に出る
    const ttSupport = tallySupportItems([
      { id: 'tt-g-21-777-5655', kind: 'superchat', channelId: 'tt:21', currency: 'TTCOIN', amount: 30, giftName: 'ハート' },
      { id: 'tt-g-22-888-9999', kind: 'text', channelId: 'tt:22', currency: '', amount: 0, giftName: 'MysteryBox' }
    ]);
    const ttChips = panelExtraChips('tiktok', { support: ttSupport });
    expect(ttChips.find((c) => c.key === 'estimatedViewerSpend')).toMatchObject({
      label: '推定（視聴者の消費）',
      text: '約¥56（ほか 1件は金額不明）'
    });
    const ttVenue = venueItemsForPlatform('tiktok', {
      records: { text: '4', isPlaceholder: false },
      concurrent: { text: '77', isPlaceholder: false },
      streamAge: { text: '15分', isPlaceholder: false },
      facts: { viewers: 77, support: ttSupport }
    });
    expect(ttVenue?.find((i) => i.key === 'estimatedViewerSpend')).toMatchObject({
      label: '推定（視聴者の消費）',
      text: '約¥56（ほか 1件は金額不明）'
    });

    for (const excluded of ['showroom', 'whowatch', 'abema']) {
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

  it('マーケレポート HTML にニコ生・YouTube・Kick・Twitch・ツイキャス・ミクチャ・TikTok LIVE を出し、対象外には出さない', () => {
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

    const mxComments = [
      { id: 'mx1', liveId: 'lv900000000088', text: 'ギフト', userId: '8000000013', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'mixch', ytKind: 'superchat', ytAmount: 400, ytCurrency: 'MXCOIN', ytGiftName: 'ギフト' },
      { id: 'mx2', liveId: 'lv900000000088', text: 'ギフト', userId: '8000000014', nickname: 'b', capturedAt: 1_700_000_001_000, ytPlatform: 'mixch', ytKind: 'text', ytAmount: 0, ytCurrency: '', ytGiftName: 'ギフト' }
    ];
    const mxHtml = buildMarketingDashboardHtml(aggregateMarketingReport(mxComments, 'lv900000000088'), {
      platform: 'mixch',
      commentsForAnalytics: mxComments
    });
    expect(mxHtml).toContain('推定（視聴者の消費）');
    expect(mxHtml).toContain('約¥480（ほか 1件は金額不明）');
    expect(mxHtml).toContain('https://mixch.tv/charge/coin?paidy');
    expect(mxHtml).not.toContain('手取り');

    const ttComments = [
      { id: 'tt1', liveId: 'lv900000000099', text: 'ハート ×3', userId: '8000000021', nickname: 'a', capturedAt: 1_700_000_000_000, ytPlatform: 'tiktok', ytKind: 'superchat', ytAmount: 30, ytCurrency: 'TTCOIN', ytGiftName: 'ハート', ytGiftCount: 3 },
      { id: 'tt2', liveId: 'lv900000000099', text: 'MysteryBox', userId: '8000000022', nickname: 'b', capturedAt: 1_700_000_001_000, ytPlatform: 'tiktok', ytKind: 'text', ytAmount: 0, ytCurrency: '', ytGiftName: 'MysteryBox' }
    ];
    const ttHtml = buildMarketingDashboardHtml(aggregateMarketingReport(ttComments, 'lv900000000099'), {
      platform: 'tiktok',
      commentsForAnalytics: ttComments
    });
    expect(ttHtml).toContain('推定（視聴者の消費）');
    expect(ttHtml).toContain('約¥56（ほか 1件は金額不明）');
    expect(ttHtml).toContain('https://www.tiktok.com/coin');
    expect(ttHtml).not.toContain('手取り');
  });
});
