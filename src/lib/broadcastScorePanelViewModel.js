/**
 * SC2(council/broadcast-scoring-SYNTHESIS.md §5)のpopupスコアパネル配線から、
 *   「既publish済みの診断値→buildBroadcastScorePanelHtmlへ渡すview-model」の組み立てだけを
 *   切り出した純関数。popup-entry.js側はstorage read(既存パターン)とinnerHTML代入だけを持ち、
 *   liveId突合・スコア計算・レーダー計算・ハイライト選抜の合成ロジックはここでテストする
 *   (renderBroadcastScorePanelは薄いI/Oラッパーになる)。
 */

import { computeBroadcastScoreV2 } from './broadcastScore.js';
import { buildScoreRadar } from './scoreRadar.js';
import { pickTopHighlights } from './highlightLedger.js';
import { isReportPreviewFresh } from './reportPreviewKey.js';

/**
 * @typedef {import('./broadcastScoreHtml.js').BroadcastScoreViewModel} BroadcastScoreViewModel
 */

/**
 * @typedef {{
 *   liveId?: string,
 *   phase?: string,
 *   r?: number,
 *   reachCount?: unknown,
 *   breakthroughCount?: unknown,
 *   jackpotCount?: unknown,
 *   hotDwellMs?: unknown,
 *   elapsedMs?: unknown
 * }} BroadcastScorePanelPhaseStatsInput phaseFor実行コンテキストのbgmPhaseDiagカウンタ形状
 *   (採点/レーダーが使うフィールドのみ列挙・実引数はこれよりフィールドが多くても構わない)。
 *
 * @typedef {{
 *   liveId: string,
 *   nowMs: number,
 *   previewRec?: unknown,
 *   phaseStats?: BroadcastScorePanelPhaseStatsInput|null,
 *   giftDiag?: unknown,
 *   voiceDiag?: unknown,
 *   ledger?: { liveId?: string, rows?: unknown[] }|null
 * }} BroadcastScorePanelViewModelInput
 */

/**
 * @param {BroadcastScorePanelViewModelInput|null|undefined} input
 * @returns {BroadcastScoreViewModel|null} liveId不一致/未観測(previewが無い)ならnull
 *   (呼び出し側は「まだデータがありません」の空状態文言を出す)。
 */
export function buildBroadcastScorePanelViewModel(input) {
  const src = /** @type {Partial<BroadcastScorePanelViewModelInput>} */ (input && typeof input === 'object' ? input : {});
  const lid = String(src.liveId || '').trim().toLowerCase();
  if (!lid) return null;
  const nowMs = Number.isFinite(Number(src.nowMs)) ? Number(src.nowMs) : Date.now();

  const previewRec = src.previewRec;
  const isFresh = isReportPreviewFresh(previewRec, nowMs);
  // liveId突合(パリティ教訓): 別配信のreportPreviewが残っていても、今の配信の数字として出さない。
  const previewLid = previewRec && typeof previewRec === 'object' ? String(/** @type {any} */ (previewRec).liveId || '').trim().toLowerCase() : '';
  const preview = isFresh && previewLid === lid ? previewRec : null;
  if (!preview) return null;

  const phaseStatsSrc = src.phaseStats && typeof src.phaseStats === 'object' ? src.phaseStats : null;
  const phaseStatsLid = phaseStatsSrc ? String(phaseStatsSrc.liveId || '').trim().toLowerCase() : '';
  const phaseStats = phaseStatsSrc && phaseStatsLid === lid ? phaseStatsSrc : null;

  const score = computeBroadcastScoreV2(/** @type {any} */ (preview), phaseStats);

  const giftDiag = src.giftDiag && typeof src.giftDiag === 'object' ? src.giftDiag : null;
  const voiceDiag = src.voiceDiag && typeof src.voiceDiag === 'object' ? src.voiceDiag : null;
  const radar = buildScoreRadar({ reportPreview: /** @type {any} */ (preview), phaseStats, giftDiag, voiceDiag });

  const ledgerSrc = src.ledger && typeof src.ledger === 'object' ? src.ledger : null;
  const ledgerLid = ledgerSrc ? String(ledgerSrc.liveId || '').trim().toLowerCase() : '';
  const ledgerRows = /** @type {import('./highlightLedger.js').HighlightRow[]} */ (
    ledgerSrc && ledgerLid === lid && Array.isArray(ledgerSrc.rows) ? ledgerSrc.rows : []
  );
  const highlights = pickTopHighlights(ledgerRows);

  const phaseChip = phaseStats ? { phase: String(phaseStats.phase || 'normal'), r: Number(phaseStats.r) || 0 } : null;

  return { score, isFinal: false, isFresh, phaseChip, radar, highlights };
}

/**
 * 再描画のchurn抑制用シグネチャ(§SC2: 同じ値の再描画ではカウントアップをやり直さない)。
 * @param {string} liveId
 * @param {BroadcastScoreViewModel|null} vm
 * @returns {string}
 */
export function broadcastScorePanelSig(liveId, vm) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!vm || !vm.score) return '';
  return `${lid}|${vm.score.total}|${vm.score.rank}|${vm.isFresh ? '1' : '0'}|${Array.isArray(vm.highlights) ? vm.highlights.length : 0}`;
}
