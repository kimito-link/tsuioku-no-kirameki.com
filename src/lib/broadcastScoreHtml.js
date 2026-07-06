// 配信スコアパネル(カラオケ採点風)の HTML を組む純関数。
//   カウントアップ演出自体は popup-entry.js(rAF)が担い、ここは器(静的構造)だけを組む。
//   依存は htmlEscape のみ=循環なし(broadcastScoreHtml.js と同じ薄い分離方針)。
import { escapeHtml } from './htmlEscape.js';
import { buildScoreRadarSvgHtml } from './scoreRadar.js';

/**
 * @typedef {{
 *   total: number,
 *   rank: 'S'|'A'|'B'|'C'|'D',
 *   parts: { volume: number, people: number, pace: number, heat: number }
 * }} BroadcastScore
 */

/**
 * @typedef {BroadcastScore & {
 *   base?: number,
 *   bonus?: number,
 *   bonusParts?: { reach: number, breakthrough: number, jackpot: number }
 * }} BroadcastScoreV2Like
 */

/**
 * @typedef {{ phase: string, r: number }} PhaseChipInput SC2: パネル内の現在フェーズ/R小表示(§1.3)。
 */

/**
 * @typedef {{ at: number, kind: string, label: string }} HighlightRowLike
 */

/**
 * @typedef {{
 *   score: BroadcastScoreV2Like,
 *   isFinal: boolean,        // 配信終了後の確定スコアか(true=「最終スコア」表記)
 *   isFresh: boolean,        // reportPreview が新鮮か(false=「データが古い可能性」を出す)
 *   phaseChip?: PhaseChipInput|null,   // SC2: 現在フェーズ/R小表示(未観測はnull=非表示)
 *   radar?: import('./scoreRadar.js').ScoreRadar|null, // SC2: 講評レーダー(§2.3・§2.4)
 *   highlights?: HighlightRowLike[],   // SC2: ハイライト3選(§2.2)
 *   broadcasterName?: string
 * }} BroadcastScoreViewModel
 */

/** ランク→CSSカラークラスの対応(popup.html側で色を定義)。 */
const RANK_CLASS = Object.freeze({ S: 'nl-score-rank--s', A: 'nl-score-rank--a', B: 'nl-score-rank--b', C: 'nl-score-rank--c', D: 'nl-score-rank--d' });

/** フェーズ内部値→日本語ラベル(bgmPhaseDiag.js の PHASE_LABEL と同じ辞書・非export値のため複製せず薄く独立保持)。
 *   @type {Readonly<Record<string, string>>} */
const PHASE_CHIP_LABEL = Object.freeze({
  normal: '通常', atsui: '煽り', reach: 'リーチ', breakthrough: '突破', jackpot: '大当たり', payout: '払い出し'
});

/**
 * SC2: パネル内の現在フェーズ/R小表示(§1.3「現在フェーズ/R小表示」)。未観測(phaseChipなし)は空文字。
 * @param {PhaseChipInput|null|undefined} phaseChip
 * @returns {string}
 */
function buildPhaseChipHtml(phaseChip) {
  if (!phaseChip || typeof phaseChip !== 'object') return '';
  const label = PHASE_CHIP_LABEL[String(phaseChip.phase)] || String(phaseChip.phase || '通常');
  const r = Number(phaseChip.r) || 0;
  return (
    `<p class="nl-score-phase-chip">現在フェーズ: ${escapeHtml(label)}` +
    ` <span class="nl-score-phase-r">(R=${r.toFixed(2)})</span></p>`
  );
}

/**
 * SC2: 感性ボーナス行(§1.3「感性ボーナス行」・§6却下事項「加点音の積み増し禁止」に伴い視覚のみ)。
 *   base/bonus/bonusParts が無ければ(v1のみの入力)何も出さない。
 * @param {BroadcastScoreV2Like} score
 * @returns {string}
 */
function buildBonusRowHtml(score) {
  if (!Number.isFinite(Number(score?.bonus))) return '';
  const bonus = Number(score.bonus) || 0;
  const bp = score.bonusParts && typeof score.bonusParts === 'object' ? score.bonusParts : { reach: 0, breakthrough: 0, jackpot: 0 };
  return (
    `<div class="nl-score-bonus-row" id="broadcastScoreBonusRow" data-bonus="${bonus}">` +
      `<span class="nl-score-bonus-label">感性ボーナス</span>` +
      `<span class="nl-score-bonus-val">+${bonus}</span>` +
      `<span class="nl-score-bonus-breakdown">` +
        `(リーチ+${Number(bp.reach) || 0} / 突破+${Number(bp.breakthrough) || 0} / 大当たり+${Number(bp.jackpot) || 0})` +
      `</span>` +
    `</div>`
  );
}

/**
 * SC2: 講評レーダーの器(§2.3・§2.4)。radarが無ければ何も出さない。
 * @param {import('./scoreRadar.js').ScoreRadar|null|undefined} radar
 * @returns {string}
 */
function buildRadarSectionHtml(radar) {
  const svg = buildScoreRadarSvgHtml(radar);
  if (!svg) return '';
  return `<div class="nl-score-radar-section" id="broadcastScoreRadarSection">${svg}</div>`;
}

/**
 * SC2: ハイライト3選の器(§2.2)。空配列/未指定は空文字(ノイズにしない)。
 * @param {HighlightRowLike[]|null|undefined} highlights
 * @returns {string}
 */
function buildHighlightsSectionHtml(highlights) {
  const rows = Array.isArray(highlights) ? highlights : [];
  if (rows.length === 0) return '';
  const items = rows
    .map((row) => `<li class="nl-score-highlight-item">${escapeHtml(String(row?.label || ''))}</li>`)
    .join('');
  return (
    `<div class="nl-score-highlights-section" id="broadcastScoreHighlights">` +
      `<p class="nl-score-highlights-title">今回のハイライト</p>` +
      `<ul class="nl-score-highlights-list">${items}</ul>` +
    `</div>`
  );
}

/**
 * 配信スコアパネルの HTML を組む(カウントアップ前の初期状態=数値0からJS側でアニメーションする)。
 * @param {BroadcastScoreViewModel|null|undefined} vm
 * @returns {string} 空なら ''(未観測)
 */
export function buildBroadcastScorePanelHtml(vm) {
  if (!vm || typeof vm !== 'object' || !vm.score) return '';
  const { score, isFinal, isFresh, phaseChip, radar, highlights } = vm;
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
      buildBonusRowHtml(score) +
      buildPhaseChipHtml(phaseChip) +
      buildRadarSectionHtml(radar) +
      buildHighlightsSectionHtml(highlights) +
      staleNote +
    `</div>`
  );
}
