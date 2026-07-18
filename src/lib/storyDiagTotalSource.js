/**
 * storyDiagTotalSource.js — 「記録している応援コメント N 件」の N を1箇所で決める純関数。
 *
 * 設計正本: story-diag-realtime-sync-DESIGN.md §C-1(会議→Fable、2026-07-18)。
 *
 * 入力の出どころ: panelSummary = nls_panel_summary_<lv>(content-entry.js が取込イベント+
 *   min-gap 2秒で popup 非依存に publish する recordedCount・AGENTS.md §12.8 の表示正本)。
 *   fallbackTotal = 呼び手が手元に持つ配列長(popup: STORY_SOURCE_STATE 由来 / venue: 鏡の total)。
 * 出力の使われ方: ①popup の STORY_AVATAR_DIAG_STATE.total と ②venue の診断パネル total。
 * 担う責務: 正本(selectDisplayRecordedCount)優先・不在時のみ fallback、の選択と出所ラベル。
 * 担わない責務: 単調化(呼び手の storyDiagMonotonic が担う)・storage read・描画。
 * ★禁止(§12.8): fallback を max で混ぜない。正本が有効なら正本のみを返す。
 *
 * @module storyDiagTotalSource
 */

import { selectDisplayRecordedCount } from './displayRecordedCount.js';

/**
 * @param {unknown} value
 * @returns {number}
 */
function nonNegativeIntOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * panelSummary が指定 liveId のものとして有効に使えるか判定する。
 * @param {unknown} panelSummary
 * @param {string} liveId
 * @returns {boolean}
 */
function isUsablePanelSummaryForLive(panelSummary, liveId) {
  if (!panelSummary || typeof panelSummary !== 'object') return false;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return false;
  const s = /** @type {{ liveId?: unknown, recordedCount?: unknown }} */ (panelSummary);
  const summaryLid = String(s.liveId || '').trim().toLowerCase();
  if (summaryLid !== lid) return false;
  return Number.isFinite(Number(s.recordedCount));
}

/**
 * @param {{
 *   panelSummary?: unknown,
 *   liveId?: string,
 *   fallbackTotal?: number,
 *   nowMs?: number
 * }} args
 * @returns {{ total: number, source: 'panel'|'fallback', panelAgeSec: number|null }}
 */
export function resolveStoryDiagTotal({ panelSummary, liveId, fallbackTotal, nowMs } = {}) {
  if (isUsablePanelSummaryForLive(panelSummary, liveId)) {
    const s = /** @type {{ updatedAt?: unknown }} */ (panelSummary);
    const now = Number.isFinite(Number(nowMs)) && Number(nowMs) > 0 ? Number(nowMs) : Date.now();
    const updatedAt = Number(s.updatedAt);
    const panelAgeSec =
      Number.isFinite(updatedAt) && updatedAt > 0
        ? Math.max(0, Math.floor((now - updatedAt) / 1000))
        : null;
    return {
      total: selectDisplayRecordedCount(panelSummary),
      source: 'panel',
      panelAgeSec
    };
  }
  return {
    total: nonNegativeIntOrZero(fallbackTotal),
    source: 'fallback',
    panelAgeSec: null
  };
}
