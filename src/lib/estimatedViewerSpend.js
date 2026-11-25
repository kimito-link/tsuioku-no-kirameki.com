/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】視聴者の推定購入額／チケット基準推定／推定消費ptの単価・日付付き為替レート・純粋計算
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* ・配信者の手取り計算
 * 【書けるstorageキー】なし
 * 【正本宣言】推定（視聴者の購入額）／チケット基準の推定／推定（視聴者の消費）に使う価格・為替・出典・日付はこのファイル1本だけ
 *
 * estimatedViewerSpend.js — 公式で価格・消費ptを確認済みの項目のみを対象に、
 * 視聴者の推定購入額（JPY）または推定消費（pt）を算出する。
 *
 * ■対象（公式で価格・消費ptを確認済みのものだけ）:
 *   - ニコ生: 有料ギフト pt（1pt = 1円 Web標準）
 *   - YouTube: スーパーチャット・スーパーステッカー（非JPYはECB基準為替で換算）
 *   - Kick: サブスク・ギフトサブ（1件 = $5 USD → ECB基準為替で円換算）
 *   - Twitch: 有料サブスク・ギフトサブ（Tier1 $4.99 / Tier2 $9.99 / Tier3 $24.99 → 円換算、Prime=0除外、まとめギフト内訳は二重計上しない）
 *   - ツイキャス:
 *     (a) 公式アイテムチケット1枚の円（お茶爆50=500円 / お茶爆100=1,000円 / お茶爆300=3,000円 / お茶爆500=5,000円 / 極茶爆1000=10,000円）→「チケット基準の推定」
 *     (b) 公式確認済み消費pt（お茶爆50=500pt / お茶爆100=1,000pt。1pt≠1円のため pt 表記を残す）→「推定（視聴者の消費）」
 *     (c) 表にない有料アイテムは金額・ptに足さず「ほか n件は金額不明」と件数のみ表示
 *   - ミクチャ（mixch）:
 *     (a) ギフトの消費コイン × 1.2円（Web クレカ/Paidy 最小パック 400コイン＝480円・税込、2026-11-24 確認）→「推定（視聴者の消費）」
 *     (b) コイン数が不明なギフトは円換算せず「ほか n件は金額不明」と件数のみ表示
 *     ※ VIP の銀行振込・LINE Pay は別価格であり、キャンペーンの無料コインは含めない。
 *   - TikTok LIVE（tiktok）:
 *     (a) ギフトの消費コイン × 56/30円（ログイン後の Web チャージ画面 30コイン＝¥56、2026-11-24 確認）→「推定（視聴者の消費）」
 *     (b) コイン数が不明なギフトは円換算せず「ほか n件は金額不明」と件数のみ表示
 *     ※ ログイン後のみ表示。アプリ内課金は別価格。配信者の受取額（ダイヤ）ではない。
 *
 * ■対象外（確認できない値段は作らない・配信者の取り分を支払額と混同しない）:
 *   - ニコニ広告 pt、無料ポイント／無料ギフト、ツイキャスの無料お茶・応援アイテム・お団子スコア
 *   - Twitch Bits（1 Bit = 1セントは配信者の取り分であり、視聴者の購入支払額ではないため除外）
 *   - Kick Kicks（投げ銭単価が公式未確定のため除外）
 *   - SHOWROOM / ふわっち / ABEMA のギフト・アイテム等（今回は対象外）
 *     ※ SHOWROOM: gift_list の point（記録は SRPT=point×個数）が G 単価と同じである公式の確証が無く、
 *       買った G とおまけ G の区別も取得側に無いため、円換算しない（2026-11-24 調査）。
 *
 * - ytGiftToNico.js の固定為替は使わない。
 * - 配信者の受取（推定）は、公式が率・単価を公開しているものだけ（STREAMER_TAKE_HOME_RATES・v0.1.2225・りんくさん承認 2026-11-25）。
 *   YouTube のスパチャ・ステッカー 70%／Kick のサブスク・ギフトサブ $4.75／Twitch の Bits 1 Bit=1セント。ほかは出さない（「推定 —」）。
 *   税・手数料・事務所の取り分は人によって違うので引かない（「手数料・税差引前の目安」と書く）。
 *
 * @module estimatedViewerSpend
 */

export const ESTIMATED_VIEWER_SPEND_LABEL = '推定（視聴者の購入額）';
export const ESTIMATED_VIEWER_CONSUMPTION_LABEL = '推定（視聴者の消費）';
export const ESTIMATED_TICKET_BASIS_LABEL = 'チケット基準の推定';
/** ツイキャスのお茶爆の消費pt。円ではないので、円の推定と同じ言葉にしない（v0.1.2207）。 */
export const TWITCASTING_CONSUMPTION_PT_LABEL = 'お茶爆の消費pt（推定）';
/** 推定の式があるのに、値段が公式で確認できる応援がまだ無いとき（横欄・会場の「推定 —」）の説明 */
export const ESTIMATED_VIEWER_SPEND_EMPTY_TITLE = 'このPCの記録に、値段が公式で確認できる応援が来たら表示します。';
/** マーケの「この配信の記録」で推定が 0 のときの注記 */
export const ESTIMATED_VIEWER_SPEND_EMPTY_NOTE = 'この記録には、値段が公式で確認できる応援がありません。';
/** 円の推定の式があるサービス（ニコ生は公式pt待ちと区別できないので、0 のときの「—」は出さない） */
export const ESTIMATED_VIEWER_SPEND_PLATFORMS = Object.freeze(['youtube', 'twitch', 'kick', 'twitcasting', 'mixch', 'tiktok']);

/**
 * 価格・消費pt・為替の正本（すべて確認日付と公式一次出典 URL を明記）。
 */
export const ESTIMATED_VIEWER_SPEND_RATES = Object.freeze({
  // 出典: https://point.nicovideo.jp/ （2026-11-23 確認）
  niconicoGiftPt: Object.freeze({
    jpyPerPoint: 1, // Web ブラウザ購入の標準単価 1pt = 1円（税込）
    asOf: '2026-11-23',
    sourceName: 'ニコニコポイント公式（Web購入標準単価）',
    sourceUrl: 'https://point.nicovideo.jp/',
    note: 'Webブラウザ購入の標準単価（1pt=1円・税込）で試算。アプリ課金やプレゼントポイント等により実際の支払額と異なる場合があります。'
  }),
  // 出典: https://help.kick.com/en/articles/15159735 ・ https://help.kick.com/en/articles/15064143 （2026-11-24 確認）
  kickSub: Object.freeze({
    usdPerSub: 5, // サブスク／ギフトサブ 1件 = $5.00 USD（Kicks 投げ銭は単価不明のため対象外）
    asOf: '2026-11-24',
    sourceName: 'Kick Help Center (Subscriptions / Gifted Subscriptions)',
    sourceUrl: 'https://help.kick.com/en/articles/15159735',
    giftSourceUrl: 'https://help.kick.com/en/articles/15064143',
    note: 'サブスク・ギフトサブ 1件=$5 USD（2026-11-24確認）をECB基準為替で円換算。地域別価格・アプリ課金等で実際と異なる場合あり。Kicksは単価不明のため含めません。'
  }),
  // 出典（2026-11-24 本文裏取り済み）:
  //   - 単価正本（静的HTML本文で $4.99 / $9.99 / $24.99 を確認）:
  //     https://blog.twitch.tv/en/2017/04/19/everything-you-need-to-know-about-our-new-subscriptions-beta-4f7535749f2c/
  //   - 公式Help単価併記（レンダリング本文で "Tier 1 Sub: $4.99" / "Tier 2 Sub: $9.99" / "Tier 3 Sub: $24.99" を確認）:
  //     https://help.twitch.tv/s/article/lifetime-subscriber-guide-for-partners?language=en_US
  //   - ギフトサブ仕様（Tier 1/2/3 対応の確認用。この記事本文にはドル単価の数値記載なし）:
  //     https://help.twitch.tv/s/article/gift-subscriptions?language=en_US
  //   - 地域別価格表: https://help.twitch.tv/s/article/local-sub-price-countries?language=en_US
  twitchSub: Object.freeze({
    tierUsd: Object.freeze({
      'Tier 1': 4.99, // Tier 1 = $4.99 USD（2026-11-24 公式Blog/Help本文で確認）
      'Tier 2': 9.99, // Tier 2 = $9.99 USD（2026-11-24 公式Blog/Help本文で確認）
      'Tier 3': 24.99, // Tier 3 = $24.99 USD（2026-11-24 公式Blog/Help本文で確認）
      Prime: 0 // Prime Gaming サブは追加支払 0 として除外
    }),
    asOf: '2026-11-24',
    sourceName: 'Twitch Official Blog & Help (Subscription Tiers $4.99 / $9.99 / $24.99)',
    sourceUrl: 'https://blog.twitch.tv/en/2017/04/19/everything-you-need-to-know-about-our-new-subscriptions-beta-4f7535749f2c/',
    tierPriceHelpUrl: 'https://help.twitch.tv/s/article/lifetime-subscriber-guide-for-partners?language=en_US',
    giftSpecUrl: 'https://help.twitch.tv/s/article/gift-subscriptions?language=en_US',
    localPriceUrl: 'https://help.twitch.tv/s/article/local-sub-price-countries?language=en_US',
    note: '有料サブ・ギフトサブ（Tier1 $4.99 / Tier2 $9.99 / Tier3 $24.99、Prime除外、2026-11-24確認）をECB基準為替で円換算。地域別価格・アプリ課金で実際と異なる場合あり。Bitsは視聴者支払額と一致しないため含めません。'
  }),
  // 出典: https://twitcasting.tv/helpcenter.php?pid=HELP_TICKET_ITEM_TABLE （2026-11-24 本文確認）
  twitcastingTicketJpy: Object.freeze({
    itemsJpy: Object.freeze({
      お茶爆50: 500, // お茶爆50チケット 1枚 = 500円（2026-11-24 公式販売テーブルで確認）
      お茶爆100: 1000, // お茶爆100チケット 1枚 = 1,000円（2026-11-24 公式販売テーブルで確認）
      お茶爆300: 3000, // お茶爆300チケット 1枚 = 3,000円（2026-11-24 公式販売テーブルで確認）
      お茶爆500: 5000, // お茶爆500チケット 1枚 = 5,000円（2026-11-24 公式販売テーブルで確認）
      極茶爆1000: 10000 // 極茶爆1000チケット 1枚 = 10,000円（2026-11-24 公式販売テーブルで確認）
    }),
    asOf: '2026-11-24',
    sourceName: 'ツイキャス公式ヘルプ（アイテムチケットの販売テーブル）',
    sourceUrl: 'https://twitcasting.tv/helpcenter.php?pid=HELP_TICKET_ITEM_TABLE',
    note: '公式アイテムチケット1枚の価格（お茶爆50=500円・お茶爆100=1,000円・お茶爆300=3,000円・お茶爆500=5,000円・極茶爆1000=10,000円、2026-11-24確認）によるチケット基準の推定です。ポイント購入・アプリ内課金・オートチャージでは実際の支払と異なる場合があります。配信者の受取額ではありません。'
  }),
  // 出典: https://twitcasting.tv/helpcenter.php?pid=ANNOUNCE_JA_20250715 （2026-11-24 本文確認）
  twitcastingItemPt: Object.freeze({
    itemsPt: Object.freeze({
      お茶爆50: 500, // お茶爆50 = 500pt（2026-11-24 公式お知らせで確認）
      お茶爆100: 1000 // お茶爆100 = 1,000pt（2026-11-24 公式お知らせで確認）
    }),
    asOf: '2026-11-24',
    sourceName: 'ツイキャス公式ヘルプ（特別収益対象アイテム消費ポイント）',
    sourceUrl: 'https://twitcasting.tv/helpcenter.php?pid=ANNOUNCE_JA_20250715',
    note: '公式で消費ptを確認できたアイテム（お茶爆50=500pt・お茶爆100=1,000pt、2026-11-24確認）のみ合算。1pt=1円ではないため円換算せずptで表示します。お団子スコアや無料のお茶・応援アイテムは含めません。'
  }),
  // 出典: https://mixch.tv/charge/coin?paidy （Web クレカ/Paidy 最小パック 400コイン＝480円・税込 → 1コイン＝1.2円、2026-11-24 確認）
  // ※ VIP の銀行振込・LINE Pay は別価格であること、キャンペーンの無料コインは含めないこと。
  mixchCoin: Object.freeze({
    jpyPerCoin: 1.2, // Web クレカ/Paidy 最小パック 400コイン＝480円（税込）→ 1コイン＝1.2円
    packCoins: 400,
    packJpy: 480,
    asOf: '2026-11-24',
    sourceName: 'ミクチャ公式 Web チャージ（クレカ/Paidy 最小パック 400コイン=480円・税込）',
    sourceUrl: 'https://mixch.tv/charge/coin?paidy',
    note: 'Web クレカ/Paidy 最小パック（400コイン=480円・税込、1コイン=1.2円、2026-11-24確認）による視聴者の消費推定です。VIPの銀行振込や別決済・大口パック・キャンペーンの無償コイン等により実際の支払と異なる場合があります。配信者の受取額ではありません。'
  }),
  // 出典: https://www.tiktok.com/coin （ログイン後の Web チャージ画面。30コイン＝¥56、600＝¥1,120、1,000＝¥1,860、5,000＝¥9,290。2026-11-24 確認）
  // ※ ログイン後のみ表示。アプリ内課金は別価格。配信者の受取額（ダイヤ）ではない。
  tiktokCoin: Object.freeze({
    jpyPerCoin: 56 / 30, // 30コイン＝¥56 → 1コイン＝56/30円（約1.867円）
    packCoins: 30,
    packJpy: 56,
    asOf: '2026-11-24',
    sourceName: 'TikTok 公式 Web チャージ画面（最小パック 30コイン=56円）',
    sourceUrl: 'https://www.tiktok.com/coin',
    note: 'TikTok Web チャージ最小パック（30コイン=56円、1コイン≒1.867円、2026-11-24確認）による視聴者の消費推定です。大口パックやアプリ内課金では別価格のため実際の支払と異なる場合があります。配信者の受取額（ダイヤ）ではありません。'
  }),
  // 出典: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html （2026-11-20 確定値）
  fx: Object.freeze({
    baseCurrency: 'EUR',
    asOf: '2026-11-20',
    sourceName: 'European Central Bank (ECB) Euro foreign exchange reference rates',
    sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
    feedUrl: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
    /** 2026-11-20 確定値（1 EUR あたり各通貨。1 USD = 174.35 / 1.0990 ≒ 158.6442 JPY） */
    eurRates: Object.freeze({
      EUR: 1,
      JPY: 174.35,
      USD: 1.0990,
      GBP: 0.83735,
      CHF: 0.9223,
      AUD: 1.6487,
      CAD: 1.5723,
      NZD: 1.9968,
      CNY: 7.3388,
      HKD: 8.6150,
      SGD: 1.4160,
      KRW: 1472.04,
      INR: 101.8500,
      PHP: 70.091,
      THB: 37.262,
      IDR: 20071.37,
      MYR: 4.5196,
      BRL: 6.5259,
      MXN: 20.9547,
      SEK: 11.2125,
      NOK: 10.7180,
      DKK: 7.4746,
      PLN: 4.4583,
      CZK: 24.469,
      HUF: 373.55,
      RON: 5.3493,
      ISK: 137.20,
      TRY: 55.5788,
      ILS: 3.6737,
      ZAR: 19.1987
    })
  })
});

/**
 * YouTube のスパチャ・ステッカー以外は法定通貨換算の対象外。
 * （Bits / Kicks / ふわっち / SHOWROOM / ミクチャ / TikTok / ツイキャスお団子スコアを明示除外）
 */
const NON_FIAT_UNITS = new Set(['BITS', 'KICKS', 'WWITEM', 'SRPT', 'MXCOIN', 'TTCOIN', 'TCSCORE']);

/**
 * 1 通貨単位あたりの円レート（ECB 2026-11-20 基準）を返す。未掲載通貨は null。
 * @param {string} currency
 * @returns {number|null}
 */
export function jpyPerCurrencyUnit(currency) {
  const code = String(currency || '').trim().toUpperCase();
  if (!code || NON_FIAT_UNITS.has(code)) return null;
  if (code === 'JPY') return 1;
  const rates = /** @type {Record<string, number>} */ (ESTIMATED_VIEWER_SPEND_RATES.fx.eurRates);
  const perEur = rates[code];
  const jpyPerEur = rates.JPY;
  if (!(perEur > 0) || !(jpyPerEur > 0)) return null;
  return jpyPerEur / perEur;
}

/**
 * 数値テキスト（例: "6,650" や "6,650pt"）から正のギフト pt を取り出す。
 * @param {unknown} raw
 * @returns {number}
 */
export function parsePositiveGiftPoints(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }
  const s = String(raw ?? '').replace(/[,，\s]|pt$/gi, '').trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Twitch のサブスク Tier 表記（"Tier 1"/"1000"/"Tier 2"/"2000"/"Tier 3"/"3000"/"Prime"）を正規化する。
 * @param {unknown} rawTier
 * @returns {'Tier 1' | 'Tier 2' | 'Tier 3' | 'Prime'}
 */
export function normalizeTwitchSubTier(rawTier) {
  const s = String(rawTier ?? '').trim();
  if (/^prime$/i.test(s)) return 'Prime';
  if (s === '2000' || /^tier\s*2$/i.test(s)) return 'Tier 2';
  if (s === '3000' || /^tier\s*3$/i.test(s)) return 'Tier 3';
  return 'Tier 1';
}

/**
 * @typedef {{
 *   platform: 'niconico' | 'youtube' | 'kick' | 'twitch' | 'twitcasting' | 'mixch' | 'tiktok',
 *   jpy: number,
 *   ticketJpy?: number,
 *   points?: number,
 *   coins?: number,
 *   usd?: number,
 *   hasFxConversion: boolean,
 *   asOf: string,
 *   fxAsOf?: string,
 *   sourceName: string,
 *   sourceUrl: string,
 *   ptSourceUrl?: string,
 *   unconverted: Array<{ currency: string, amount: number }>,
 *   giftPoints?: number,
 *   subCount?: number,
 *   giftSubCount?: number,
 *   tierCounts?: { tier1: number, tier2: number, tier3: number, prime: number },
 *   unknownPaidCount?: number
 * }} EstimatedViewerSpendResult
 */

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   text: string,
 *   title: string,
 *   note: string,
 *   sourceUrl: string,
 *   asOf: string
 * }} EstimatedViewerSpendDisplayItem
 */

/**
 * ニコ生の有料ギフト pt から視聴者の推定購入額（JPY）を算出する。
 * 0 以下や未取得は null（チップを出さない）。
 * @param {unknown} giftPointsRaw
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateNiconicoGiftSpendJpy(giftPointsRaw) {
  const pts = parsePositiveGiftPoints(giftPointsRaw);
  if (!(pts > 0)) return null;
  const cfg = ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt;
  const jpy = Math.round(pts * cfg.jpyPerPoint);
  if (!(jpy > 0)) return null;
  return {
    platform: 'niconico',
    jpy,
    hasFxConversion: false,
    asOf: cfg.asOf,
    sourceName: cfg.sourceName,
    sourceUrl: cfg.sourceUrl,
    unconverted: [],
    giftPoints: pts
  };
}

/**
 * YouTube のスーパーチャット・スーパーステッカー通貨別合計から視聴者の推定購入額（JPY）を算出する。
 * @param {Record<string, unknown>|null|undefined} amounts
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateYoutubeSupportSpendJpy(amounts) {
  if (!amounts || typeof amounts !== 'object') return null;
  let totalJpy = 0;
  let hasFxConversion = false;
  /** @type {Array<{ currency: string, amount: number }>} */
  const unconverted = [];

  for (const [rawCode, rawVal] of Object.entries(amounts)) {
    const code = String(rawCode || '').trim().toUpperCase();
    const val = Number(rawVal);
    if (!code || NON_FIAT_UNITS.has(code) || !Number.isFinite(val) || val <= 0) continue;
    const rate = jpyPerCurrencyUnit(code);
    if (rate == null) {
      unconverted.push({ currency: code, amount: Math.round(val * 100) / 100 });
      continue;
    }
    if (code !== 'JPY') hasFxConversion = true;
    totalJpy += val * rate;
  }

  const jpy = Math.round(totalJpy);
  if (!(jpy > 0)) return null;
  const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
  return {
    platform: 'youtube',
    jpy,
    hasFxConversion,
    asOf: fx.asOf,
    fxAsOf: fx.asOf,
    sourceName: fx.sourceName,
    sourceUrl: fx.sourceUrl,
    unconverted
  };
}

/**
 * Kick のサブスク・ギフトサブ件数から視聴者の推定購入額（JPY）を算出する（1件=$5 USD、Kicks は含めない）。
 * @param {{ subCount?: unknown, giftSubCount?: unknown }|null|undefined} counts
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateKickSubSpendJpy(counts) {
  if (!counts || typeof counts !== 'object') return null;
  const subCount = Math.max(0, Math.floor(Number(counts.subCount) || 0));
  const giftSubCount = Math.max(0, Math.floor(Number(counts.giftSubCount) || 0));
  const totalSubs = subCount + giftSubCount;
  if (!(totalSubs > 0)) return null;
  const cfg = ESTIMATED_VIEWER_SPEND_RATES.kickSub;
  const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
  const usdRate = jpyPerCurrencyUnit('USD');
  if (usdRate == null) return null;
  const usd = Math.round(totalSubs * cfg.usdPerSub * 100) / 100;
  const jpy = Math.round(usd * usdRate);
  if (!(jpy > 0)) return null;
  return {
    platform: 'kick',
    jpy,
    usd,
    hasFxConversion: true,
    asOf: cfg.asOf,
    fxAsOf: fx.asOf,
    sourceName: cfg.sourceName,
    sourceUrl: cfg.sourceUrl,
    unconverted: [],
    subCount,
    giftSubCount
  };
}

/**
 * Twitch の Tier 別サブスク・ギフトサブ件数から視聴者の推定購入額（JPY）を算出する。
 * Prime は 0 として除外し、Bits も含めない。
 * @param {{ tier1?: unknown, tier2?: unknown, tier3?: unknown, prime?: unknown }|null|undefined} tierCounts
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateTwitchSubSpendJpy(tierCounts) {
  if (!tierCounts || typeof tierCounts !== 'object') return null;
  const tier1 = Math.max(0, Math.floor(Number(tierCounts.tier1) || 0));
  const tier2 = Math.max(0, Math.floor(Number(tierCounts.tier2) || 0));
  const tier3 = Math.max(0, Math.floor(Number(tierCounts.tier3) || 0));
  const prime = Math.max(0, Math.floor(Number(tierCounts.prime) || 0));
  if (tier1 + tier2 + tier3 <= 0) return null;
  const cfg = ESTIMATED_VIEWER_SPEND_RATES.twitchSub;
  const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
  const usdRate = jpyPerCurrencyUnit('USD');
  if (usdRate == null) return null;
  const usd =
    Math.round(
      (tier1 * cfg.tierUsd['Tier 1'] + tier2 * cfg.tierUsd['Tier 2'] + tier3 * cfg.tierUsd['Tier 3']) * 100
    ) / 100;
  const jpy = Math.round(usd * usdRate);
  if (!(jpy > 0)) return null;
  return {
    platform: 'twitch',
    jpy,
    usd,
    hasFxConversion: true,
    asOf: cfg.asOf,
    fxAsOf: fx.asOf,
    sourceName: cfg.sourceName,
    sourceUrl: cfg.sourceUrl,
    unconverted: [],
    tierCounts: { tier1, tier2, tier3, prime }
  };
}

/**
 * ツイキャスのアイテム名からベース名と個数サフィックス（例: "お茶爆100ｘ2" → { baseName: "お茶爆100", count: 2 }）を抽出する。
 * @param {unknown} rawName
 * @param {unknown} [explicitCount]
 * @returns {{ baseName: string, count: number }}
 */
export function parseTwitcastingGiftNameAndCount(rawName, explicitCount) {
  const full = String(rawName ?? '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .trim();
  if (!full) return { baseName: '', count: 0 };
  const suffixMatch = /^(.*?)\s*[xｘ×✕]\s*(\d{1,6})$/.exec(full);
  const baseName = (suffixMatch ? suffixMatch[1] : full).trim();
  const parsedSuffix = suffixMatch ? Number(suffixMatch[2]) : 1;
  const exp = Number(explicitCount);
  const count = Number.isFinite(exp) && exp > 0 ? Math.floor(exp) : Math.max(1, Math.floor(parsedSuffix) || 1);
  return { baseName, count };
}

/**
 * ツイキャスの1行を累積オブジェクトへ加算する（純関数）。
 * - 公式アイテムチケット表（お茶爆50/100/300/500・極茶爆1000）は ticketJpy へ合算。
 * - 公式確認済み消費pt表（お茶爆50=500pt・お茶爆100=1,000pt）は confirmedPt へ合算。
 * - 無料のお茶（ベース名 "お茶"）や無料応援アイテム（isPaidGift!==true かつ badges に 'paid' 無し）は除外。
 * - 表にない有料アイテムは金額・ptに足さず unknownPaidCount に件数のみ加算。お団子スコアは使わない。
 * @param {{ ticketJpy?: number, ticketCount?: number, confirmedPt: number, confirmedCount: number, unknownPaidCount: number }} acc
 * @param {Record<string, unknown>|null|undefined} row
 */
export function accumulateTwitcastingGiftItem(acc, row) {
  if (!acc || !row || typeof row !== 'object') return;
  const kind = String(row.ytKind ?? row.kind ?? '').trim().toLowerCase();
  if (kind && kind !== 'superchat' && kind !== 'gift') return;
  const rawName = row.ytGiftName ?? row.giftName ?? '';
  const rawCount = row.ytGiftCount ?? row.giftCount;
  const { baseName, count } = parseTwitcastingGiftNameAndCount(rawName, rawCount);
  if (!baseName || count <= 0) return;

  // 無料のお茶（お茶 / お茶×10 等）は除外
  if (baseName === 'お茶') return;
  if (row.isPaidGift === false) return;

  const ticketTable = /** @type {Record<string, number>} */ (ESTIMATED_VIEWER_SPEND_RATES.twitcastingTicketJpy.itemsJpy);
  const ptTable = /** @type {Record<string, number>} */ (ESTIMATED_VIEWER_SPEND_RATES.twitcastingItemPt.itemsPt);

  const hasTicket = Object.prototype.hasOwnProperty.call(ticketTable, baseName);
  const hasPt = Object.prototype.hasOwnProperty.call(ptTable, baseName);

  if (hasTicket || hasPt) {
    if (hasTicket) {
      acc.ticketJpy = (Number(acc.ticketJpy) || 0) + ticketTable[baseName] * count;
      acc.ticketCount = (Number(acc.ticketCount) || 0) + count;
    }
    if (hasPt) {
      acc.confirmedPt += ptTable[baseName] * count;
      acc.confirmedCount += count;
    }
    return;
  }

  const badges = Array.isArray(row.badges) ? row.badges : [];
  const isPaid = row.isPaidGift === true || badges.includes('paid');
  if (isPaid) {
    acc.unknownPaidCount += count;
  }
}

/**
 * ツイキャスの累積結果から推定モデル（チケット基準の円＋お茶爆50/100消費pt＋未知有料件数）を生成する。
 * @param {{ ticketJpy?: unknown, confirmedPt?: unknown, confirmedCount?: unknown, unknownPaidCount?: unknown }|null|undefined} summary
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateTwitcastingConsumptionPt(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const ticketJpy = Math.max(0, Math.floor(Number(summary.ticketJpy) || 0));
  const points = Math.max(0, Math.floor(Number(summary.confirmedPt) || 0));
  const unknownPaidCount = Math.max(0, Math.floor(Number(summary.unknownPaidCount) || 0));
  if (ticketJpy <= 0 && points <= 0 && unknownPaidCount <= 0) return null;
  const ticketCfg = ESTIMATED_VIEWER_SPEND_RATES.twitcastingTicketJpy;
  const ptCfg = ESTIMATED_VIEWER_SPEND_RATES.twitcastingItemPt;
  return {
    platform: 'twitcasting',
    jpy: ticketJpy,
    ticketJpy,
    points,
    hasFxConversion: false,
    asOf: ticketCfg.asOf,
    sourceName: ticketCfg.sourceName,
    sourceUrl: ticketCfg.sourceUrl,
    ptSourceUrl: ptCfg.sourceUrl,
    unconverted: [],
    unknownPaidCount
  };
}

/**
 * YouTube のコメント配列からスパチャ・ステッカーのみの通貨別合計を集計して推定購入額を算出する。
 * @param {readonly unknown[]} comments
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateYoutubeSpendFromComments(comments) {
  if (!Array.isArray(comments) || !comments.length) return null;
  /** @type {Record<string, number>} */
  const amounts = {};
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const c = /** @type {{ ytKind?: unknown, kind?: unknown, ytPlatform?: unknown, ytAmount?: unknown, amount?: unknown, ytCurrency?: unknown, currency?: unknown }} */ (row);
    const plat = String(c.ytPlatform || '').trim().toLowerCase();
    if (plat && plat !== 'youtube') continue;
    const kind = String(c.ytKind ?? c.kind ?? '').trim().toLowerCase();
    if (kind !== 'superchat' && kind !== 'sticker') continue;
    const amount = Number(c.ytAmount ?? c.amount);
    const cur = String(c.ytCurrency ?? c.currency ?? '').trim().toUpperCase();
    if (!cur || !Number.isFinite(amount) || amount <= 0) continue;
    amounts[cur] = (amounts[cur] || 0) + amount;
  }
  return estimateYoutubeSupportSpendJpy(amounts);
}

/**
 * Kick のコメント配列からサブスク・ギフトサブ件数を集計して推定購入額を算出する（Kicks は含めない）。
 * @param {readonly unknown[]} comments
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateKickSpendFromComments(comments) {
  if (!Array.isArray(comments) || !comments.length) return null;
  let subCount = 0;
  let giftSubCount = 0;
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const c = /** @type {{ ytKind?: unknown, kind?: unknown, ytPlatform?: unknown, ytGiftCount?: unknown, giftCount?: unknown, giftPartOf?: unknown }} */ (row);
    const plat = String(c.ytPlatform || '').trim().toLowerCase();
    if (plat && plat !== 'kick') continue;
    const kind = String(c.ytKind ?? c.kind ?? '').trim().toLowerCase();
    if (kind === 'membership') {
      subCount += 1;
    } else if (kind === 'membership_gift') {
      if (c.giftPartOf) continue;
      const rawGc = c.ytGiftCount ?? c.giftCount;
      const gc = rawGc !== undefined && rawGc !== null ? Number(rawGc) : 1;
      if (Number.isFinite(gc) && gc > 0) giftSubCount += Math.floor(gc);
    }
  }
  return estimateKickSubSpendJpy({ subCount, giftSubCount });
}

/**
 * Twitch のコメント配列から有料サブ・ギフトサブを Tier 別に集計して推定購入額を算出する（Prime・Bits・まとめ贈り内訳は除外）。
 * @param {readonly unknown[]} comments
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateTwitchSpendFromComments(comments) {
  if (!Array.isArray(comments) || !comments.length) return null;
  const counts = { tier1: 0, tier2: 0, tier3: 0, prime: 0 };
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const c = /** @type {{ ytKind?: unknown, kind?: unknown, ytPlatform?: unknown, subTier?: unknown, ytGiftCount?: unknown, giftCount?: unknown, giftPartOf?: unknown }} */ (row);
    const plat = String(c.ytPlatform || '').trim().toLowerCase();
    if (plat && plat !== 'twitch') continue;
    const kind = String(c.ytKind ?? c.kind ?? '').trim().toLowerCase();
    if (kind !== 'membership' && kind !== 'membership_gift') continue;
    let n = 1;
    if (kind === 'membership_gift') {
      if (c.giftPartOf) continue;
      const rawGc = c.ytGiftCount ?? c.giftCount;
      const gc = rawGc !== undefined && rawGc !== null ? Number(rawGc) : 1;
      n = Number.isFinite(gc) ? Math.max(0, Math.floor(gc)) : 1;
    }
    if (n <= 0) continue;
    const tier = normalizeTwitchSubTier(c.subTier);
    if (tier === 'Prime') counts.prime += n;
    else if (tier === 'Tier 2') counts.tier2 += n;
    else if (tier === 'Tier 3') counts.tier3 += n;
    else counts.tier1 += n;
  }
  return estimateTwitchSubSpendJpy(counts);
}

/**
 * ツイキャスのコメント配列からチケット基準の円（5種）・消費pt（お茶爆50/100）・未知有料アイテム件数を集計する。
 * @param {readonly unknown[]} comments
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateTwitcastingSpendFromComments(comments) {
  if (!Array.isArray(comments) || !comments.length) return null;
  const acc = { ticketJpy: 0, ticketCount: 0, confirmedPt: 0, confirmedCount: 0, unknownPaidCount: 0 };
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (row);
    const plat = String(rec.ytPlatform || '').trim().toLowerCase();
    if (plat && plat !== 'twitcasting') continue;
    accumulateTwitcastingGiftItem(acc, rec);
  }
  return estimateTwitcastingConsumptionPt(acc);
}

/**
 * ミクチャの1行を累積オブジェクトへ加算する（純関数）。
 * - コイン数が判明しているギフト（currency='MXCOIN' またはギフト行で amount > 0）は coins へ合算。
 * - コイン数が分からないギフト（amount <= 0 かつ giftName あり、または kind='superchat'|'gift' / currency='MXCOIN'）は
 *   円換算せず unknownGiftCount に件数のみ加算。
 * - 通常コメント（kind='text' かつ giftName 無し）やファン登録（kind='mx_fan'）は含めない。
 * @param {{ coins: number, giftCount: number, unknownGiftCount: number }} acc
 * @param {Record<string, unknown>|null|undefined} row
 */
export function accumulateMixchGiftItem(acc, row) {
  if (!acc || !row || typeof row !== 'object') return;
  const kind = String(row.ytKind ?? row.kind ?? '').trim().toLowerCase();
  if (kind === 'mx_fan' || kind === 'follow' || kind === 'membership' || kind === 'membership_gift' || kind === 'tw_raid') {
    return;
  }
  const cur = String(row.ytCurrency ?? row.currency ?? '').trim().toUpperCase();
  if (cur && cur !== 'MXCOIN') return;
  const rawCount = Number(row.ytGiftCount ?? row.giftCount);
  const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
  const rawAmount = Number(row.ytAmount ?? row.amount);
  const hasGiftMarker =
    cur === 'MXCOIN' ||
    kind === 'superchat' ||
    kind === 'gift' ||
    Boolean(String(row.ytGiftName ?? row.giftName ?? '').trim());
  if (!hasGiftMarker) return;
  if (Number.isFinite(rawAmount) && rawAmount > 0) {
    acc.coins += Math.floor(rawAmount);
    acc.giftCount += count;
  } else {
    acc.unknownGiftCount += count;
  }
}

/**
 * ミクチャの累積結果から視聴者の推定消費（1コイン=1.2円）と未知ギフト件数を算出する。
 * VIP の銀行振込・LINE Pay は別価格であり、キャンペーンの無料コインは含めない。
 * @param {{ coins?: unknown, giftCount?: unknown, unknownGiftCount?: unknown }|null|undefined} summary
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateMixchCoinSpendJpy(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const coins = Math.max(0, Math.floor(Number(summary.coins) || 0));
  const unknownPaidCount = Math.max(0, Math.floor(Number(summary.unknownGiftCount) || 0));
  if (coins <= 0 && unknownPaidCount <= 0) return null;
  const cfg = ESTIMATED_VIEWER_SPEND_RATES.mixchCoin;
  const jpy = coins > 0 ? Math.round(coins * cfg.jpyPerCoin) : 0;
  if (jpy <= 0 && unknownPaidCount <= 0) return null;
  return {
    platform: 'mixch',
    jpy,
    coins,
    hasFxConversion: false,
    asOf: cfg.asOf,
    sourceName: cfg.sourceName,
    sourceUrl: cfg.sourceUrl,
    unconverted: [],
    unknownPaidCount
  };
}

/**
 * ミクチャのコメント配列からギフトコイン数・未知ギフト件数を集計して推定消費を算出する。
 * @param {readonly unknown[]} comments
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateMixchSpendFromComments(comments) {
  if (!Array.isArray(comments) || !comments.length) return null;
  const acc = { coins: 0, giftCount: 0, unknownGiftCount: 0 };
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (row);
    const plat = String(rec.ytPlatform || rec.platform || '').trim().toLowerCase();
    if (plat && plat !== 'mixch') continue;
    const ch = String(rec.channelId || '').trim();
    if (ch && /^(?:tc|tw|kk|sr|tt|ww|ab):/i.test(ch)) continue;
    accumulateMixchGiftItem(acc, rec);
  }
  return estimateMixchCoinSpendJpy(acc);
}

/**
 * TikTok LIVE の1行を累積オブジェクトへ加算する（純関数）。
 * - コイン数が判明しているギフト（currency='TTCOIN' またはギフト行で amount > 0）は coins へ合算。
 *   （受信時は createTtComboTracker が連打終了時に1回だけ ttGiftRow を出し、さらに同一連打 id が重複した場合も最大値のみ採用）
 * - コイン数が分からないギフト（amount <= 0 かつ giftName あり、または kind='superchat'|'gift' / currency='TTCOIN'）は
 *   円換算せず unknownGiftCount に件数のみ加算。
 * - 通常コメント（kind='text' かつ giftName 無し）やフォロー通知（kind='follow'）は含めない。
 * @param {{ coins: number, giftCount: number, unknownGiftCount: number, comboById?: Record<string, { coins: number, count: number, unk: number }> }} acc
 * @param {Record<string, unknown>|null|undefined} row
 */
export function accumulateTiktokGiftItem(acc, row) {
  if (!acc || !row || typeof row !== 'object') return;
  const kind = String(row.ytKind ?? row.kind ?? '').trim().toLowerCase();
  if (kind === 'follow' || kind === 'mx_fan' || kind === 'membership' || kind === 'membership_gift' || kind === 'tw_raid') {
    return;
  }
  const cur = String(row.ytCurrency ?? row.currency ?? '').trim().toUpperCase();
  if (cur && cur !== 'TTCOIN') return;
  const rawCount = Number(row.ytGiftCount ?? row.giftCount);
  const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
  const rawAmount = Number(row.ytAmount ?? row.amount);
  const hasGiftMarker =
    cur === 'TTCOIN' ||
    kind === 'superchat' ||
    kind === 'gift' ||
    Boolean(String(row.ytGiftName ?? row.giftName ?? '').trim());
  if (!hasGiftMarker) return;

  const rowId = String(row.id || '');
  // tt-g-<userId>-<groupId(!=0)>-<giftId> の同一連打グループが複数行混入しても二重に足さない
  if (/^tt-g-[^-]+-[1-9]\d*-\d+$/.test(rowId)) {
    const map = acc.comboById || (acc.comboById = {});
    const prev = map[rowId] || { coins: 0, count: 0, unk: 0 };
    if (Number.isFinite(rawAmount) && rawAmount > 0) {
      const c = Math.floor(rawAmount);
      if (c > prev.coins) {
        acc.coins += c - prev.coins;
        prev.coins = c;
      }
      if (count > prev.count) {
        acc.giftCount += count - prev.count;
        prev.count = count;
      }
      if (prev.unk > 0) {
        acc.unknownGiftCount = Math.max(0, acc.unknownGiftCount - prev.unk);
        prev.unk = 0;
      }
    } else if (prev.coins === 0 && count > prev.unk) {
      acc.unknownGiftCount += count - prev.unk;
      prev.unk = count;
    }
    map[rowId] = prev;
    return;
  }

  if (Number.isFinite(rawAmount) && rawAmount > 0) {
    acc.coins += Math.floor(rawAmount);
    acc.giftCount += count;
  } else {
    acc.unknownGiftCount += count;
  }
}

/**
 * TikTok LIVE の累積結果から視聴者の推定消費（1コイン=56/30円）と未知ギフト件数を算出する。
 * ログイン後のみ表示される Web チャージ画面の価格を使用し、アプリ内課金は別価格、配信者の受取額（ダイヤ）ではない。
 * @param {{ coins?: unknown, giftCount?: unknown, unknownGiftCount?: unknown }|null|undefined} summary
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateTiktokCoinSpendJpy(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const coins = Math.max(0, Math.floor(Number(summary.coins) || 0));
  const unknownPaidCount = Math.max(0, Math.floor(Number(summary.unknownGiftCount) || 0));
  if (coins <= 0 && unknownPaidCount <= 0) return null;
  const cfg = ESTIMATED_VIEWER_SPEND_RATES.tiktokCoin;
  const jpy = coins > 0 ? Math.round((coins * cfg.packJpy) / cfg.packCoins) : 0;
  if (jpy <= 0 && unknownPaidCount <= 0) return null;
  return {
    platform: 'tiktok',
    jpy,
    coins,
    hasFxConversion: false,
    asOf: cfg.asOf,
    sourceName: cfg.sourceName,
    sourceUrl: cfg.sourceUrl,
    unconverted: [],
    unknownPaidCount
  };
}

/**
 * TikTok LIVE のコメント配列からギフトコイン数・未知ギフト件数を集計して推定消費を算出する。
 * @param {readonly unknown[]} comments
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateTiktokSpendFromComments(comments) {
  if (!Array.isArray(comments) || !comments.length) return null;
  const acc = { coins: 0, giftCount: 0, unknownGiftCount: 0 };
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (row);
    const plat = String(rec.ytPlatform || rec.platform || '').trim().toLowerCase();
    if (plat && plat !== 'tiktok') continue;
    const ch = String(rec.channelId || '').trim();
    if (ch && /^(?:tc|tw|kk|sr|mx|ww|ab):/i.test(ch)) continue;
    accumulateTiktokGiftItem(acc, rec);
  }
  return estimateTiktokCoinSpendJpy(acc);
}

/**
 * ニコ生以外のサービスの記録（コメント配列）から、そのサービスの式で推定を出す。式が無いサービスは null。
 * マーケの KPI・「この配信の記録」・前回との比較で同じ式を使うための入口（v0.1.2207）。
 * @param {string} platformId
 * @param {readonly unknown[]} comments
 * @returns {EstimatedViewerSpendResult|null}
 */
export function estimateViewerSpendFromComments(platformId, comments) {
  switch (String(platformId || '')) {
    case 'youtube':
      return estimateYoutubeSpendFromComments(comments);
    case 'kick':
      return estimateKickSpendFromComments(comments);
    case 'twitch':
      return estimateTwitchSpendFromComments(comments);
    case 'twitcasting':
      return estimateTwitcastingSpendFromComments(comments);
    case 'mixch':
      return estimateMixchSpendFromComments(comments);
    case 'tiktok':
      return estimateTiktokSpendFromComments(comments);
    default:
      return null;
  }
}

/**
 * 会場・横欄・マーケレポート共通の表示アイテム配列を生成する。
 * - ツイキャスは「推定（視聴者の購入額）」（チケット基準の円・5種＋未知件数。チケット基準であることは title / note に書く）と
 *   「お茶爆の消費pt（推定）」（お茶爆50/100 pt）の最大2件を返す。
 * - 円のラベルは全サービス「推定（視聴者の購入額）」1つにそろえる（v0.1.2207）。
 * - 他サービスは1件を返す。配信者の手取りは一切表示しない。
 * @param {EstimatedViewerSpendResult|null|undefined} est
 * @returns {EstimatedViewerSpendDisplayItem[]}
 */
export function formatEstimatedViewerSpendDisplays(est) {
  if (!est) return [];

  if (est.platform === 'twitcasting') {
    const ticketJpy = Math.max(0, Math.floor(Number(est.ticketJpy ?? est.jpy) || 0));
    const pts = Math.max(0, Math.floor(Number(est.points) || 0));
    const unk = Math.max(0, Math.floor(Number(est.unknownPaidCount) || 0));
    if (ticketJpy <= 0 && pts <= 0 && unk <= 0) return [];

    const ticketCfg = ESTIMATED_VIEWER_SPEND_RATES.twitcastingTicketJpy;
    const ptCfg = ESTIMATED_VIEWER_SPEND_RATES.twitcastingItemPt;
    const unkPhrase = unk > 0 ? `ほか ${unk.toLocaleString('ja-JP')}件は金額不明` : '';
    const unkSentence = unk > 0 ? `表にない有料アイテム（${unkPhrase}）は合算していません。` : '';

    /** @type {EstimatedViewerSpendDisplayItem[]} */
    const items = [];

    if (ticketJpy > 0 || (unk > 0 && pts <= 0)) {
      const text =
        ticketJpy > 0 && unk > 0
          ? `約¥${ticketJpy.toLocaleString('ja-JP')}（${unkPhrase}）`
          : ticketJpy > 0
            ? `約¥${ticketJpy.toLocaleString('ja-JP')}`
            : unkPhrase;
      const note = `ツイキャス公式アイテムチケット1枚の価格（お茶爆50=500円・お茶爆100=1,000円・お茶爆300=3,000円・お茶爆500=5,000円・極茶爆1000=10,000円、${ticketCfg.asOf}確認）によるチケット基準の推定です。${unkSentence}ポイント購入・アプリ内課金・オートチャージでは実際の支払と異なる場合があります。お団子スコアや無料のお茶・応援アイテムは含めません。配信者の受取額ではありません。`;
      items.push({
        key: 'estimatedViewerSpend',
        label: ESTIMATED_VIEWER_SPEND_LABEL,
        text,
        title: note,
        note,
        sourceUrl: ticketCfg.sourceUrl,
        asOf: ticketCfg.asOf
      });
    }

    if (pts > 0) {
      const attachUnkHere = items.length === 0 && unk > 0;
      const ptText = attachUnkHere
        ? `約${pts.toLocaleString('ja-JP')}pt（${unkPhrase}）`
        : `約${pts.toLocaleString('ja-JP')}pt`;
      const ptNote = `ツイキャスの公式確認済み有料アイテム（お茶爆50=500pt・お茶爆100=1,000pt、${ptCfg.asOf}確認）から算出した視聴者の消費ポイント推定です。1pt=1円ではないため円換算していません。${attachUnkHere ? unkSentence : ''}お団子スコアや無料のお茶・応援アイテムは含めません。配信者の受取額ではありません。`;
      items.push({
        key: 'estimatedViewerConsumption',
        label: TWITCASTING_CONSUMPTION_PT_LABEL,
        text: ptText,
        title: ptNote,
        note: ptNote,
        sourceUrl: ptCfg.sourceUrl,
        asOf: ptCfg.asOf
      });
    }

    return items;
  }

  if (est.platform === 'mixch') {
    const jpy = Math.max(0, Math.round(Number(est.jpy) || 0));
    const coins = Math.max(0, Math.floor(Number(est.coins) || 0));
    const unk = Math.max(0, Math.floor(Number(est.unknownPaidCount) || 0));
    if (jpy <= 0 && unk <= 0) return [];
    const cfg = ESTIMATED_VIEWER_SPEND_RATES.mixchCoin;
    const unkPhrase = unk > 0 ? `ほか ${unk.toLocaleString('ja-JP')}件は金額不明` : '';
    const unkSentence = unk > 0 ? `コイン数不明のギフト（${unkPhrase}）は円換算していません。` : '';
    const coinDetail = coins > 0 ? `記録ギフト計 ${coins.toLocaleString('ja-JP')}コイン × ` : '';
    const text =
      jpy > 0 && unk > 0
        ? `約¥${jpy.toLocaleString('ja-JP')}（${unkPhrase}）`
        : jpy > 0
          ? `約¥${jpy.toLocaleString('ja-JP')}`
          : unkPhrase;
    // ※ VIP の銀行振込・LINE Pay は別価格であり、キャンペーンの無料コインは含めない（画面文言には禁止語を含めない）
    const note = `ミクチャ Web クレカ/Paidy 最小パック（400コイン=480円・税込、${coinDetail}1コイン=1.2円、${cfg.asOf}確認）による視聴者の消費推定です。${unkSentence}VIPの銀行振込や別決済・大口パック・キャンペーンの無償コイン等により実際の支払と異なる場合があります。配信者の受取額ではありません。`;
    return [
      {
        key: 'estimatedViewerSpend',
        label: ESTIMATED_VIEWER_SPEND_LABEL,
        text,
        title: note,
        note,
        sourceUrl: cfg.sourceUrl,
        asOf: cfg.asOf
      }
    ];
  }

  if (est.platform === 'tiktok') {
    const jpy = Math.max(0, Math.round(Number(est.jpy) || 0));
    const coins = Math.max(0, Math.floor(Number(est.coins) || 0));
    const unk = Math.max(0, Math.floor(Number(est.unknownPaidCount) || 0));
    if (jpy <= 0 && unk <= 0) return [];
    const cfg = ESTIMATED_VIEWER_SPEND_RATES.tiktokCoin;
    const unkPhrase = unk > 0 ? `ほか ${unk.toLocaleString('ja-JP')}件は金額不明` : '';
    const unkSentence = unk > 0 ? `コイン数不明のギフト（${unkPhrase}）は円換算していません。` : '';
    const coinDetail = coins > 0 ? `記録ギフト計 ${coins.toLocaleString('ja-JP')}コイン × ` : '';
    const text =
      jpy > 0 && unk > 0
        ? `約¥${jpy.toLocaleString('ja-JP')}（${unkPhrase}）`
        : jpy > 0
          ? `約¥${jpy.toLocaleString('ja-JP')}`
          : unkPhrase;
    // ※ ログイン後のみ表示・アプリ内課金は別価格・配信者の受取額（ダイヤ）ではない（画面文言には禁止語を含めない）
    const note = `TikTok Web チャージ最小パック（30コイン=56円、${coinDetail}1コイン≒1.867円、${cfg.asOf}確認）による視聴者の消費推定です。${unkSentence}大口パックやアプリ内課金では別価格のため実際の支払と異なる場合があります。配信者の受取額（ダイヤ）ではありません。`;
    return [
      {
        key: 'estimatedViewerSpend',
        label: ESTIMATED_VIEWER_SPEND_LABEL,
        text,
        title: note,
        note,
        sourceUrl: cfg.sourceUrl,
        asOf: cfg.asOf
      }
    ];
  }

  if (!(est.jpy > 0)) return [];
  const formatted = `約¥${Math.round(est.jpy).toLocaleString('ja-JP')}`;

  if (est.platform === 'niconico') {
    const cfg = ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt;
    const note = `ニコ生有料ギフトpt（${Math.round(est.giftPoints || 0).toLocaleString('ja-JP')}pt）× 1pt=1円（${cfg.asOf}確認・Web購入標準単価）での視聴者購入額の推定です。アプリ課金や無料ポイント等で実際と異なる場合があります。配信者の受取額ではありません。`;
    return [
      {
        key: 'estimatedViewerSpend',
        label: ESTIMATED_VIEWER_SPEND_LABEL,
        text: formatted,
        title: note,
        note,
        sourceUrl: cfg.sourceUrl,
        asOf: cfg.asOf
      }
    ];
  }

  if (est.platform === 'kick') {
    const cfg = ESTIMATED_VIEWER_SPEND_RATES.kickSub;
    const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
    const total = (Number(est.subCount) || 0) + (Number(est.giftSubCount) || 0);
    const note = `Kick のサブスク・ギフトサブ計 ${total.toLocaleString('ja-JP')}件 × $5 USD（${cfg.asOf}確認、計 $${Number(est.usd || 0).toFixed(2)}）を ECB 基準為替（${fx.asOf} 確定値）で円換算した視聴者の購入額推定です。地域別価格・アプリ課金で実際と異なる場合あり。Kicks は単価不明のため含めません。配信者の受取額ではありません。`;
    return [
      {
        key: 'estimatedViewerSpend',
        label: ESTIMATED_VIEWER_SPEND_LABEL,
        text: formatted,
        title: note,
        note,
        sourceUrl: cfg.sourceUrl,
        asOf: cfg.asOf
      }
    ];
  }

  if (est.platform === 'twitch') {
    const cfg = ESTIMATED_VIEWER_SPEND_RATES.twitchSub;
    const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
    const tc = est.tierCounts || { tier1: 0, tier2: 0, tier3: 0, prime: 0 };
    const parts = [];
    if (tc.tier1 > 0) parts.push(`Tier1×${tc.tier1}`);
    if (tc.tier2 > 0) parts.push(`Tier2×${tc.tier2}`);
    if (tc.tier3 > 0) parts.push(`Tier3×${tc.tier3}`);
    const primeNote = tc.prime > 0 ? `（Prime×${tc.prime}は0として除外）` : '';
    const note = `Twitch の有料サブ・ギフトサブ（${parts.join('・')}${primeNote}、計 $${Number(est.usd || 0).toFixed(2)}、${cfg.asOf}確認）を ECB 基準為替（${fx.asOf} 確定値）で円換算した視聴者の購入額推定です。地域別価格・アプリ課金で実際と異なる場合あり。Bits は視聴者の購入支払額ではないため含めません。配信者の受取額ではありません。`;
    return [
      {
        key: 'estimatedViewerSpend',
        label: ESTIMATED_VIEWER_SPEND_LABEL,
        text: formatted,
        title: note,
        note,
        sourceUrl: cfg.sourceUrl,
        asOf: cfg.asOf
      }
    ];
  }

  const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
  const unconvText = est.unconverted.length
    ? ` 未換算通貨: ${est.unconverted.map((u) => `${u.currency} ${u.amount.toLocaleString('ja-JP')}`).join('・')}。`
    : '';
  const fxNote = est.hasFxConversion
    ? `円以外の通貨は ECB 基準為替（${fx.asOf} 確定値）で円換算しています。`
    : '円建ての記録から集計しています。';
  const note = `YouTube スーパーチャット・スーパーステッカーの記録から算出した視聴者購入額の推定です。${fxNote}${unconvText}配信者の受取額ではありません。`;
  return [
    {
      key: 'estimatedViewerSpend',
      label: ESTIMATED_VIEWER_SPEND_LABEL,
      text: formatted,
      title: note,
      note,
      sourceUrl: fx.sourceUrl,
      asOf: fx.asOf
    }
  ];
}

/**
 * 単一の代表表示を返す（1件目のチップ／カード用）。
 * @param {EstimatedViewerSpendResult|null|undefined} est
 * @returns {EstimatedViewerSpendDisplayItem|null}
 */
export function formatEstimatedViewerSpendDisplay(est) {
  const list = formatEstimatedViewerSpendDisplays(est);
  return list.length > 0 ? list[0] : null;
}

/**
 * 【正本】応援1件の見分け(v0.1.2225)。会場の演出(投げ・効果音)と、数字(横の欄・会場の帯のチップ・振り返り)が
 *   同じ物を数えるための、ただ1つの決まり。ここで「応援」と答えた行は、必ずどれかの数字を動かす。
 *   (2026-11-25 りんくさん: YouTube で投げと効果音は出るのにスパチャの数字が動かない。ジュエルのギフトはどの数字にも入らず、
 *    主の通貨以外のスパチャは主の通貨の合計を動かさなかった)
 *   値段はここでは決めない(推定の値段は上の表だけ。値段が分からない応援は件数だけ数える)。
 */
export const SUPPORT_EVENT_KINDS = Object.freeze(['superchat', 'sticker', 'membership', 'membership_gift', 'yt_gift']);

/** ギフトの名前だけ分かって値段が分からない行(kind=text)も応援として数えるサービス(記録の配信キーの頭・ytPlatform) */
const NAMED_GIFT_PLATFORM_PREFIX = Object.freeze({ showroom: 'sr:', mixch: 'mx:', tiktok: 'tt:', whowatch: 'ww:', twitcasting: 'tc:' });

/**
 * 記録の行(kind/giftName/channelId)と、会場に渡す形の行(ytKind/ytGiftName/ytPlatform)のどちらでも答える。
 * @param {unknown} row
 * @returns {boolean}
 */
export function isSupportEventRow(row) {
  if (!row || typeof row !== 'object') return false;
  const r = /** @type {Record<string, unknown>} */ (row);
  const kind = String(r.ytKind ?? r.kind ?? '').trim().toLowerCase();
  if (SUPPORT_EVENT_KINDS.includes(kind)) return true;
  if (kind && kind !== 'text') return false;
  // 一覧に無いギフト(SHOWROOM)・コイン数の分からないギフト(ミクチャ/TikTok)は kind=text で記録される。名前があれば投げられた応援
  if (!String(r.ytGiftName ?? r.giftName ?? '').trim()) return false;
  const plat = String(r.ytPlatform ?? r.platform ?? '').trim().toLowerCase();
  if (plat) return Object.prototype.hasOwnProperty.call(NAMED_GIFT_PLATFORM_PREFIX, plat);
  const ch = String(r.channelId ?? r.userId ?? '').trim().toLowerCase();
  return Object.values(NAMED_GIFT_PLATFORM_PREFIX).some((p) => ch.startsWith(p));
}

/** 配信者の受取（推定）の見出し（横の欄・会場の帯・振り返り） */
export const ESTIMATED_STREAMER_TAKE_HOME_LABEL = '推定（配信者の受取）';
/** 受取を出すときに必ず添える言葉 */
export const STREAMER_TAKE_HOME_CAVEAT = '手数料・税差引前の目安です。事務所・MCN との契約、iOS の手数料、地方消費税、源泉徴収などで実際の額は変わります。';

/**
 * 【正本】配信者の受取の率・単価（公式に公開されているものだけ）。確認日 2026-11-25（/workspace/tsk-notes/streamer-income/rates.md）。
 *   ここに無いサービス・応援は受取を出さない（SHOWROOM のシェア率は非公開と公式が明記・ふわっちのポイント付与は非公開・
 *   ミクチャ/TikTok/ツイキャス/ニコ生は公式の率が見当たらない・Twitch のサブスクは契約で変わる・Kick の KICKs は1 KICK の値段が公式に無い）。
 */
export const STREAMER_TAKE_HOME_RATES = Object.freeze({
  youtubePaidChat: Object.freeze({
    share: 0.7,
    asOf: '2026-11-25',
    sourceName: 'YouTube ヘルプ（Super Chat の収益・課金型製品モジュール）',
    sourceUrl: 'https://support.google.com/youtube/answer/7288782?hl=ja',
    sourceUrl2: 'https://support.google.com/youtube/answer/72902?hl=ja',
    note: 'スーパーチャット・スーパーステッカーの 70%（公式は地方消費税・iOS の手数料を引いた後の 70%）。',
  }),
  kickSub: Object.freeze({
    usdPerSub: 4.75,
    asOf: '2026-11-25',
    sourceName: 'Kick Help Center（Understanding KICK\'s revenue split・更新 2026-10-26）',
    sourceUrl: 'https://help.kick.com/en/articles/15159722-understanding-kick-s-revenue-split',
    note: 'サブスク・ギフトサブ1件 $5 のうち配信者 $4.75（95%）。KICKs は1 KICK の値段が公式に無いので入れていません。',
  }),
  twitchBits: Object.freeze({
    usdPerBit: 0.01,
    asOf: '2026-11-25',
    sourceName: 'Twitch Partners（1 Bit あたり 1セント）',
    sourceUrl: 'https://www.twitch.tv/p/en/partners',
    note: 'Cheer の Bits 1つにつき 1セント（参加パートナー）。サブスクの取り分は契約で変わるので入れていません。',
  }),
});

/** 受取の式があるサービス（それ以外は「推定 —」・件数と pt だけ） */
export const STREAMER_TAKE_HOME_PLATFORMS = Object.freeze(['youtube', 'kick', 'twitch']);

/**
 * 配信者の受取（推定）。応援の集計（platformMetrics.tallySupportItems の amounts・件数）から、公式の率・単価だけで出す。
 * @param {string} platformId
 * @param {{ amounts?: Record<string, unknown>, membershipCount?: unknown, membershipGiftCount?: unknown }|null|undefined} support
 * @returns {{ platform: string, jpy: number, usd?: number, asOf: string, fxAsOf: string, sourceName: string, sourceUrl: string, note: string }|null}
 */
export function estimateStreamerTakeHomeJpy(platformId, support) {
  if (!support || typeof support !== 'object') return null;
  const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
  const amounts = support.amounts && typeof support.amounts === 'object' ? support.amounts : {};
  if (platformId === 'youtube') {
    const viewer = estimateYoutubeSupportSpendJpy(amounts);
    if (!viewer) return null;
    const cfg = STREAMER_TAKE_HOME_RATES.youtubePaidChat;
    const jpy = Math.round(viewer.jpy * cfg.share);
    return jpy > 0 ? { platform: 'youtube', jpy, asOf: cfg.asOf, fxAsOf: fx.asOf, sourceName: cfg.sourceName, sourceUrl: cfg.sourceUrl, note: cfg.note } : null;
  }
  const usdRate = jpyPerCurrencyUnit('USD');
  if (usdRate == null) return null;
  if (platformId === 'kick') {
    const subs = Math.max(0, Math.floor(Number(support.membershipCount) || 0)) + Math.max(0, Math.floor(Number(support.membershipGiftCount) || 0));
    if (!(subs > 0)) return null;
    const cfg = STREAMER_TAKE_HOME_RATES.kickSub;
    const usd = Math.round(subs * cfg.usdPerSub * 100) / 100;
    const jpy = Math.round(usd * usdRate);
    return jpy > 0 ? { platform: 'kick', jpy, usd, asOf: cfg.asOf, fxAsOf: fx.asOf, sourceName: cfg.sourceName, sourceUrl: cfg.sourceUrl, note: cfg.note } : null;
  }
  if (platformId === 'twitch') {
    const bits = Math.max(0, Math.floor(Number(amounts.BITS) || 0));
    if (!(bits > 0)) return null;
    const cfg = STREAMER_TAKE_HOME_RATES.twitchBits;
    const usd = Math.round(bits * cfg.usdPerBit * 100) / 100;
    const jpy = Math.round(usd * usdRate);
    return jpy > 0 ? { platform: 'twitch', jpy, usd, asOf: cfg.asOf, fxAsOf: fx.asOf, sourceName: cfg.sourceName, sourceUrl: cfg.sourceUrl, note: cfg.note } : null;
  }
  return null;
}

/**
 * 記録の行（ytKind / ytAmount / ytCurrency・振り返り用）から、配信者の受取（推定）の材料を数える。
 * @param {string} platformId
 * @param {readonly unknown[]} comments
 */
export function estimateStreamerTakeHomeFromComments(platformId, comments) {
  if (!Array.isArray(comments) || !comments.length || !STREAMER_TAKE_HOME_PLATFORMS.includes(platformId)) return null;
  /** @type {Record<string, number>} */
  const amounts = {};
  let membershipCount = 0;
  let membershipGiftCount = 0;
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const c = /** @type {Record<string, unknown>} */ (row);
    const plat = String(c.ytPlatform || '').trim().toLowerCase();
    if (plat && plat !== platformId) continue;
    const kind = String(c.ytKind ?? c.kind ?? '').trim().toLowerCase();
    const amount = Number(c.ytAmount ?? c.amount);
    const cur = String(c.ytCurrency ?? c.currency ?? '').trim().toUpperCase();
    if ((kind === 'superchat' || kind === 'sticker') && cur && Number.isFinite(amount) && amount > 0) amounts[cur] = (amounts[cur] || 0) + amount;
    else if (kind === 'membership') membershipCount += 1;
    else if (kind === 'membership_gift' && !c.giftPartOf) {
      const rawGc = c.ytGiftCount ?? c.giftCount;
      const gc = rawGc !== undefined && rawGc !== null ? Number(rawGc) : 1;
      if (Number.isFinite(gc) && gc > 0) membershipGiftCount += Math.floor(gc);
    }
  }
  return estimateStreamerTakeHomeJpy(platformId, { amounts, membershipCount, membershipGiftCount });
}

/**
 * 受取（推定）の表示。式があるのに材料が無ければ「—」（placeholder）。式の無いサービスは理由つきの「—」。
 * @param {string} platformId
 * @param {ReturnType<typeof estimateStreamerTakeHomeJpy>} est
 * @returns {{ key: string, label: string, text: string, title: string, note: string, sourceUrl: string, asOf: string, placeholder: boolean }}
 */
export function formatStreamerTakeHomeDisplay(platformId, est) {
  const base = { key: 'estimatedStreamerTakeHome', label: ESTIMATED_STREAMER_TAKE_HOME_LABEL };
  if (est && est.jpy > 0) {
    const fxNote = est.platform === 'youtube' || est.usd ? `為替は ECB 基準（${est.fxAsOf}）。` : '';
    const note = `${est.note}${fxNote}${STREAMER_TAKE_HOME_CAVEAT}出典: ${est.sourceName}（${est.asOf} 確認）`;
    return { ...base, text: `約¥${est.jpy.toLocaleString('ja-JP')}`, title: note, note, sourceUrl: est.sourceUrl, asOf: est.asOf, placeholder: false };
  }
  const why = STREAMER_TAKE_HOME_PLATFORMS.includes(platformId)
    ? '公式の率・単価で数えられる応援がこのPCの記録に来たら表示します。'
    : 'このサービスは配信者の取り分（率・単価）を公式に公開していないので出していません。件数と pt だけ数えています。';
  return { ...base, text: '—', title: why, note: why, sourceUrl: '', asOf: '', placeholder: true };
}
