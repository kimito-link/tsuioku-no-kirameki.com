/**
 * v0.1.363: ギフト総ポイントから「配信者が受け取る収益の目安」を概算する純関数。
 *
 * ⚠️ 重要な前提（誤情報を出さないための設計制約。詳細は調査メモ参照）:
 * - ニコニコは奨励金の計算式・還元率を**公式に非公開**にしている（工作防止・法令遵守。
 *   dwango 公式の収益化ガイド明記）。よって「正確な受取額」は原理的に算出不可能。
 *   本モジュールは**幅（レンジ）付きの「目安」**だけを返し、確定額は断定しない。
 * - 実際の奨励金はギフトだけでなく閲覧数/コメント/ニコニ広告/プレミアム会員の全体分配
 *   等の**複合**で決まる。よって本値は「配信の総収益」ではなく
 *   **「ギフト由来分のみの目安」**。呼び出し側はその旨を必ず明示すること。
 * - 他プラットフォーム比較は「**同じ額のギフトが投げられたと仮定した単純試算**」。
 *   実際は視聴者層・ギフト文化・単価分布が PF ごとに異なり同額が来る保証はない。
 *   「他 PF ならこれだけ稼げる」と読ませない注記が呼び出し側に必須。
 *
 * 入力の `totalPoints` は giftEventStore.summarizeGiftEvents の totalPoints を想定
 * （ニコ生は 1pt = 1 円で購入されるため、購入額相当の円とみなせる）。
 *
 * 副作用なし。率テーブルは出典コメント付きでここに集約し、率が変わっても本ファイル
 * 1 箇所の修正で済むようにする。
 *
 * @see src/lib/giftEventStore.js - summarizeGiftEvents().totalPoints（入力 pt の正本）
 * @see reference_gift_revenue_estimate_feasibility - メモリ: 還元率の出典と調査
 */

/**
 * 配信者取り分（還元率）の目安テーブル。すべて**非公式の推定値**（各社は公式に
 * 率を出していない）。low/high はネット上で観測される幅、mid は代表値。
 *
 * 出典の要旨（2026-05-25 調査）:
 * - niconico: 「約4割」説が主流（公式は非公開と明言）。広めにレンジを取る。
 * - twitcasting: お茶爆で「約70%」。
 * - youtube: SuperChat は表向き 70%、実質 45〜65% 説。
 * - fuwacch: 「約50%」（他より高め）。
 * - 17live: 「約30%」。
 *
 * @typedef {{ key: string, label: string, low: number, mid: number, high: number, note?: string }} PlatformRate
 */

/** @type {readonly PlatformRate[]} */
export const GIFT_PAYOUT_RATES = Object.freeze([
  Object.freeze({
    key: 'niconico',
    label: 'ニコニコ生放送',
    low: 0.3,
    mid: 0.4,
    high: 0.5,
    note: '公式は還元率を非公開。約4割という推定が主流。'
  }),
  Object.freeze({
    key: 'twitcasting',
    label: 'ツイキャス',
    low: 0.6,
    mid: 0.7,
    high: 0.7,
    note: 'お茶爆。約70%という推定。'
  }),
  Object.freeze({
    key: 'youtube',
    label: 'YouTube（スーパーチャット）',
    low: 0.45,
    mid: 0.6,
    high: 0.7,
    note: '表向き約70%、実質45〜65%という推定。'
  }),
  Object.freeze({
    key: 'fuwacch',
    label: 'ふわっち',
    low: 0.4,
    mid: 0.5,
    high: 0.5,
    note: '約50%という推定（他より高め）。'
  }),
  Object.freeze({
    key: '17live',
    label: '17LIVE',
    low: 0.25,
    mid: 0.3,
    high: 0.35,
    note: '約30%という推定。'
  })
]);

/** niconico の率定義（①で使う既定）。テーブルから引く。 */
export const NICONICO_RATE = /** @type {PlatformRate} */ (
  GIFT_PAYOUT_RATES.find((r) => r.key === 'niconico')
);

/**
 * @param {unknown} v
 * @returns {number} 有限かつ 0 以上の数値、それ以外は 0
 */
function toNonNegNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {number} n
 * @returns {number} 0 以上に丸めた整数（円・四捨五入）
 */
function roundYen(n) {
  return Math.max(0, Math.round(n));
}

/**
 * ①ニコ生のギフト由来収益の目安。レンジ（low/mid/high 円）を返す。
 *
 * これは「ギフト由来分の目安」であって配信の総収益ではない（奨励金は他要素も含む）。
 * 確定額ではなく目安である旨は呼び出し側で必ず明示すること。
 *
 * @param {unknown} totalPoints ギフト総ポイント（1pt=1円相当）
 * @returns {{
 *   totalPoints: number,
 *   low: number, mid: number, high: number,
 *   rate: PlatformRate,
 *   isEstimate: true,
 *   giftDerivedOnly: true
 * }}
 */
export function estimateNiconicoGiftRevenue(totalPoints) {
  const pt = toNonNegNumber(totalPoints);
  const r = NICONICO_RATE;
  return {
    totalPoints: pt,
    low: roundYen(pt * r.low),
    mid: roundYen(pt * r.mid),
    high: roundYen(pt * r.high),
    rate: r,
    isEstimate: true,
    giftDerivedOnly: true
  };
}

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   low: number, mid: number, high: number,
 *   rate: PlatformRate
 * }} PlatformRevenueRow
 */

/**
 * ②各プラットフォームで「同じ額のギフトが投げられたと仮定した場合」の収益目安比較。
 * mid 降順で返す（niconico も含む。比較の基準として）。
 *
 * 「同額が投げられた前提の単純試算」であり、実際の他 PF 収益を約束するものではない
 * （視聴者層・ギフト文化が PF ごとに異なる）。呼び出し側はその注記を必須とする。
 *
 * @param {unknown} totalPoints ギフト総ポイント（1pt=1円相当）
 * @returns {{
 *   totalPoints: number,
 *   rows: PlatformRevenueRow[],
 *   isEstimate: true,
 *   sameAmountAssumption: true
 * }}
 */
export function estimateCrossPlatformGiftRevenue(totalPoints) {
  const pt = toNonNegNumber(totalPoints);
  const rows = GIFT_PAYOUT_RATES.map((r) => ({
    key: r.key,
    label: r.label,
    low: roundYen(pt * r.low),
    mid: roundYen(pt * r.mid),
    high: roundYen(pt * r.high),
    rate: r
  })).sort((a, b) => {
    if (b.mid !== a.mid) return b.mid - a.mid;
    return a.label.localeCompare(b.label);
  });
  return {
    totalPoints: pt,
    rows,
    isEstimate: true,
    sameAmountAssumption: true
  };
}
