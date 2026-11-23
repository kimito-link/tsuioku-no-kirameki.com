/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】視聴者の推定購入額の単価・日付付き為替レート・純粋計算
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* ・配信者の手取り計算
 * 【書けるstorageキー】なし
 * 【正本宣言】推定（視聴者の購入額）に使う価格・為替・出典・日付はこのファイル1本だけ
 *
 * estimatedViewerSpend.js — YouTube のスーパーチャット・スーパーステッカーと、
 * ニコ生の有料ギフト pt のみを対象に、視聴者の推定購入額（JPY）を算出する。
 *
 * - ytGiftToNico.js の固定為替は使わない。
 * - 配信者の手取り・分配率・控除額は一切算出・表示しない。
 * - 対象外: ニコニ広告 pt、無料ポイント/無料ギフト、Twitch Bits、Kick Kicks、
 *   SHOWROOM・ミクチャ・ふわっち・ツイキャス・TikTok・ABEMA のギフト/アイテム等。
 *
 * @module estimatedViewerSpend
 */

export const ESTIMATED_VIEWER_SPEND_LABEL = '推定（視聴者の購入額）';

/**
 * 価格と為替の正本（すべて確認日付と一次出典 URL を明記）。
 * - ニコニコポイント: Web ブラウザ購入の標準単価（1pt = 1円・税込）。
 * - 為替レート: 欧州中央銀行（ECB）公表の Euro foreign exchange reference rates（1 EUR あたり各通貨）。
 *   非 JPY 通貨は (JPY per EUR) / (currency per EUR) で円換算する。
 */
export const ESTIMATED_VIEWER_SPEND_RATES = Object.freeze({
  niconicoGiftPt: Object.freeze({
    jpyPerPoint: 1,
    asOf: '2026-11-23',
    sourceName: 'ニコニコポイント公式（Web購入標準単価）',
    sourceUrl: 'https://point.nicovideo.jp/',
    note: 'Webブラウザ購入の標準単価（1pt=1円・税込）で試算。アプリ課金やプレゼントポイント等により実際の支払額と異なる場合があります。'
  }),
  fx: Object.freeze({
    baseCurrency: 'EUR',
    asOf: '2026-11-20',
    sourceName: 'European Central Bank (ECB) Euro foreign exchange reference rates',
    sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
    feedUrl: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
    /** 2026-11-20 確定値（1 EUR あたり各通貨） */
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

/** YouTube のスパチャ・ステッカー以外は換算対象外（他サービス独自単位を明示除外）。 */
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
 * @typedef {{
 *   platform: 'niconico' | 'youtube',
 *   jpy: number,
 *   hasFxConversion: boolean,
 *   asOf: string,
 *   sourceName: string,
 *   sourceUrl: string,
 *   unconverted: Array<{ currency: string, amount: number }>,
 *   giftPoints?: number
 * }} EstimatedViewerSpendResult
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
 * - 円（JPY）はそのまま合算。
 * - 円以外の主要通貨は ECB 日付付き基準レートで円換算して合算。
 * - 未掲載通貨は推測換算せず unconverted へ記録する。
 * - 換算できた円額が 0 なら null。
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
    sourceName: fx.sourceName,
    sourceUrl: fx.sourceUrl,
    unconverted
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
    const c = /** @type {{ ytKind?: unknown, ytPlatform?: unknown, ytAmount?: unknown, ytCurrency?: unknown }} */ (row);
    const plat = String(c.ytPlatform || '').trim().toLowerCase();
    if (plat && plat !== 'youtube') continue;
    const kind = String(c.ytKind || '').trim().toLowerCase();
    if (kind !== 'superchat' && kind !== 'sticker') continue;
    const amount = Number(c.ytAmount);
    const cur = String(c.ytCurrency || '').trim().toUpperCase();
    if (!cur || !Number.isFinite(amount) || amount <= 0) continue;
    amounts[cur] = (amounts[cur] || 0) + amount;
  }
  return estimateYoutubeSupportSpendJpy(amounts);
}

/**
 * 会場・横欄・マーケレポート共通の表示テキストと説明文（title / note）を生成する。
 * 配信者の手取りは表示しない。
 * @param {EstimatedViewerSpendResult|null|undefined} est
 * @returns {{ label: string, text: string, title: string, note: string, sourceUrl: string, asOf: string }|null}
 */
export function formatEstimatedViewerSpendDisplay(est) {
  if (!est || !(est.jpy > 0)) return null;
  const formatted = `約¥${Math.round(est.jpy).toLocaleString('ja-JP')}`;
  if (est.platform === 'niconico') {
    const cfg = ESTIMATED_VIEWER_SPEND_RATES.niconicoGiftPt;
    const note = `ニコ生有料ギフトpt（${Math.round(est.giftPoints || 0).toLocaleString('ja-JP')}pt）× 1pt=1円（${cfg.asOf}確認・Web購入標準単価）での視聴者購入額の推定です。アプリ課金や無料ポイント等で実際と異なる場合があります。配信者の受取額ではありません。`;
    return {
      label: ESTIMATED_VIEWER_SPEND_LABEL,
      text: formatted,
      title: note,
      note,
      sourceUrl: cfg.sourceUrl,
      asOf: cfg.asOf
    };
  }
  const fx = ESTIMATED_VIEWER_SPEND_RATES.fx;
  const unconvText = est.unconverted.length
    ? ` 未換算通貨: ${est.unconverted.map((u) => `${u.currency} ${u.amount.toLocaleString('ja-JP')}`).join('・')}。`
    : '';
  const fxNote = est.hasFxConversion
    ? `円以外の通貨は ECB 基準為替（${fx.asOf} 確定値）で円換算しています。`
    : '円建ての記録から集計しています。';
  const note = `YouTube スーパーチャット・スーパーステッカーの記録から算出した視聴者購入額の推定です。${fxNote}${unconvText}配信者の受取額ではありません。`;
  return {
    label: ESTIMATED_VIEWER_SPEND_LABEL,
    text: formatted,
    title: note,
    note,
    sourceUrl: fx.sourceUrl,
    asOf: fx.asOf
  };
}
