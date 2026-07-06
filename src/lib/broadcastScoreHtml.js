// 配信スコアパネル(カラオケ採点風)の HTML を組む純関数。
//   カウントアップ演出自体は popup-entry.js(rAF)が担い、ここは器(静的構造)だけを組む。
//   依存は htmlEscape のみ=循環なし(broadcastScoreHtml.js と同じ薄い分離方針)。
import { escapeHtml } from './htmlEscape.js';

/**
 * @typedef {{
 *   total: number,
 *   rank: 'S'|'A'|'B'|'C'|'D',
 *   parts: { volume: number, people: number, pace: number, heat: number }
 * }} BroadcastScore
 */

/**
 * @typedef {{
 *   score: BroadcastScore,
 *   isFinal: boolean,        // 配信終了後の確定スコアか(true=「最終スコア」表記)
 *   isFresh: boolean,        // reportPreview が新鮮か(false=「データが古い可能性」を出す)
 *   broadcasterName?: string
 * }} BroadcastScoreViewModel
 */

/** ランク→CSSカラークラスの対応(popup.html側で色を定義)。 */
const RANK_CLASS = Object.freeze({ S: 'nl-score-rank--s', A: 'nl-score-rank--a', B: 'nl-score-rank--b', C: 'nl-score-rank--c', D: 'nl-score-rank--d' });

/**
 * 配信スコアパネルの HTML を組む(カウントアップ前の初期状態=数値0からJS側でアニメーションする)。
 * @param {BroadcastScoreViewModel|null|undefined} vm
 * @returns {string} 空なら ''(未観測)
 */
export function buildBroadcastScorePanelHtml(vm) {
  if (!vm || typeof vm !== 'object' || !vm.score) return '';
  const { score, isFinal, isFresh } = vm;
  const rankClass = RANK_CLASS[score.rank] || RANK_CLASS.D;
  const staleNote = isFresh === false
    ? '<p class="nl-score-stale">⚠ データがやや古い可能性があります(popupを開き直すと新鮮化)</p>'
    : '';
  const titleText = isFinal ? '最終スコア(配信終了)' : '現在のスコア';
  return (
    `<div class="nl-score-panel" data-nl-score-final="${isFinal ? '1' : '0'}">` +
      `<p class="nl-score-title">${escapeHtml(titleText)}</p>` +
      `<div class="nl-score-total-row">` +
        `<span class="nl-score-total-num" id="broadcastScoreTotalNum" data-target="${score.total}">0</span>` +
        `<span class="nl-score-total-unit">点</span>` +
        `<span class="nl-score-rank ${rankClass}" id="broadcastScoreRank" hidden>${escapeHtml(score.rank)}</span>` +
      `</div>` +
      `<ul class="nl-score-parts">` +
        `<li><span class="nl-score-part-label">盛り上がり量</span><span class="nl-score-part-val">${score.parts.volume}/30</span></li>` +
        `<li><span class="nl-score-part-label">来場の人気</span><span class="nl-score-part-val">${score.parts.people}/30</span></li>` +
        `<li><span class="nl-score-part-label">勢い</span><span class="nl-score-part-val">${score.parts.pace}/20</span></li>` +
        `<li><span class="nl-score-part-label">熱量</span><span class="nl-score-part-val">${score.parts.heat}/20</span></li>` +
      `</ul>` +
      staleNote +
    `</div>`
  );
}
