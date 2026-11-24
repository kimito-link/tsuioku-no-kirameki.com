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
 *
 * ■対象外（確認できない値段は作らない・配信者の取り分を支払額と混同しない）:
 *   - ニコニ広告 pt、無料ポイント／無料ギフト、ツイキャスの無料お茶・応援アイテム・お団子スコア
 *   - Twitch Bits（1 Bit = 1セントは配信者の取り分であり、視聴者の購入支払額ではないため除外）
 *   - Kick Kicks（投げ銭単価が公式未確定のため除外）
 *   - SHOWROOM / ミクチャ / TikTok / ふわっち / ABEMA のギフト・アイテム等（今回は対象外）
 *
 * - ytGiftToNico.js の固定為替は使わない。
 * - 配信者の手取り・分配率・控除額は一切算出・表示しない。
 *
 * @module estimatedViewerSpend
 */

export const ESTIMATED_VIEWER_SPEND_LABEL = '推定（視聴者の購入額）';
export const ESTIMATED_VIEWER_CONSUMPTION_LABEL = '推定（視聴者の消費）';
export const ESTIMATED_TICKET_BASIS_LABEL = 'チケット基準の推定';

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
 *   platform: 'niconico' | 'youtube' | 'kick' | 'twitch' | 'twitcasting',
 *   jpy: number,
 *   ticketJpy?: number,
 *   points?: number,
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
 * 会場・横欄・マーケレポート共通の表示アイテム配列を生成する。
 * - ツイキャスは「チケット基準の推定」（円・5種＋未知件数）と「推定（視聴者の消費）」（お茶爆50/100 pt）の最大2件を返す。
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
        label: ESTIMATED_TICKET_BASIS_LABEL,
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
        label: ESTIMATED_VIEWER_CONSUMPTION_LABEL,
        text: ptText,
        title: ptNote,
        note: ptNote,
        sourceUrl: ptCfg.sourceUrl,
        asOf: ptCfg.asOf
      });
    }

    return items;
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
