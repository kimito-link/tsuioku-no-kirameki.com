/**
 * liveOgStats.js — 配信ごと OGP カードの og:description に載せる「応援の数字」を組み立てる純関数(v0.1.1518)。
 *
 * ★DOM も fetch も持たない。1 配信ぶんの保存データ(api/live-ranking.js が SET したもの)を渡すと、
 *   来場・コメント・ギフト pt・広告 pt の 4 つを整形した文と、それを含む og:description 文字列を返すだけ。
 *
 * ■ 何を出すか / 出さないか(設計 §10・§11)
 *   - 出す: 来場(watchCount)・コメント(commentCount)・ギフト pt(giftTotal・上位10名合計)・広告 pt(adTotal)。
 *     いずれもニコ生が番組ページ / 公開ランキングで公開している集計値で、/live/ が既に同じ語・同じ整形で出している。
 *   - 出さない: 支援者名・コメント本文・個別ポイント。ここには合計 4 つの数字しか材料が無い。
 *   - 値は Number() して「有限かつ >0」のものだけ載せる(0・NaN・欠落は省く=数字を発明しない)。
 *
 * ■ 時刻(いつ時点の数字か)はここに入れない。og:description には時刻ラベルを付けない設計(§9)。
 *   画像側(scripts/ で作る)にだけ時刻を焼く。★時点フィールドの語をここで扱わない
 *   (src/lib は timeAuthorityRegistry の走査対象で、独自の時点解釈を持つファイルを増やせない)。
 *
 * @module liveOgStats
 */

import { formatNumberJa } from './htmlText.js';
import { liveShareText } from './liveRankingView.js';

/** live なしのときの og:description(liveOgHtml.js の定数と同文・そちらが正本)。 */
const LIVE_OG_DESCRIPTION_FALLBACK =
  'いまこの瞬間、この配信をギフト・広告・コメントで支えている人を、配信サムネ・配信者つきでリアルタイムに。主役は配信者ではなく「応援した人」。';

/** 数字部が空のときに続ける一言(前半だけでは尻切れなので補う)。 */
const NO_STATS_TAIL = '追憶のきらめき ランキングで、支えている人を配信ごとに。';

/** @typedef {{ key: string, label: string, text: string, unit: string }} LiveOgStatItem */

/**
 * 有限かつ >0 の数だけ返す(0・NaN・欠落は null)。
 * @param {unknown} v
 * @returns {number|null}
 */
function positiveNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 配信の 4 つの数字を、載せるものだけ整形して並べる(0・NaN・欠落は省く)。
 * @param {{ watchCount?: unknown, commentCount?: unknown, giftTotal?: unknown, adTotal?: unknown }|null|undefined} live
 * @returns {LiveOgStatItem[]}
 */
export function liveOgStatItems(live) {
  const l = live && typeof live === 'object' ? live : null;
  /** @type {ReadonlyArray<{ key: string, label: string, value: unknown, unit: string }>} */
  const spec = [
    { key: 'watch', label: '来場', value: l ? l.watchCount : null, unit: '' },
    { key: 'comment', label: 'コメント', value: l ? l.commentCount : null, unit: '' },
    { key: 'gift', label: 'ギフト', value: l ? l.giftTotal : null, unit: 'pt' },
    { key: 'ad', label: '広告', value: l ? l.adTotal : null, unit: 'pt' }
  ];
  /** @type {LiveOgStatItem[]} */
  const out = [];
  for (const s of spec) {
    const n = positiveNumberOrNull(s.value);
    if (n == null) continue;
    out.push({ key: s.key, label: s.label, text: formatNumberJa(n), unit: s.unit });
  }
  return out;
}

/**
 * items を「来場8,368・コメント12,324・ギフト117,280pt・広告1,275,956pt」の 1 文にする。
 * @param {LiveOgStatItem[]} items
 * @returns {string} 空配列なら ''
 */
export function liveOgStatsSentence(items) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return '';
  return arr.map((it) => `${it.label}${it.text}${it.unit || ''}`).join('・');
}

/**
 * og:description の確定文。
 *   live あり・数字あり: `${liveShareText(live)}。${sentence}。`
 *   live あり・数字なし: `${liveShareText(live)}。${NO_STATS_TAIL}`
 *   live なし          : 現行の汎用 description(配信で変えない)
 * @param {{ streamer?: { name?: unknown }|null, title?: unknown, watchCount?: unknown, commentCount?: unknown, giftTotal?: unknown, adTotal?: unknown }|null|undefined} live
 * @returns {string}
 */
export function liveOgDescription(live) {
  const l = live && typeof live === 'object' ? live : null;
  if (!l) return LIVE_OG_DESCRIPTION_FALLBACK;
  const head = liveShareText(l);
  const sentence = liveOgStatsSentence(liveOgStatItems(l));
  return sentence ? `${head}。${sentence}。` : `${head}。${NO_STATS_TAIL}`;
}
