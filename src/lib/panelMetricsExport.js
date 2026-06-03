/**
 * パネル向け速報メトリクス（content メモリ → popup 直結、storage バイパス）。
 *
 * @module panelMetricsExport
 */

import { isPanelLiveSummary } from './panelLiveSummary.js';

/** popup → watch content のメッセージ型 */
export const PANEL_METRICS_MESSAGE_TYPE = 'NLS_EXPORT_PANEL_METRICS';

/**
 * content が返す応答を組み立てる。
 * @param {unknown} payload buildPanelLiveSummary 相当
 * @returns {{ ok: boolean, metrics?: Record<string, unknown>, error?: string }}
 */
export function buildPanelMetricsResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'metrics_empty' };
  }
  const lid = String(/** @type {Record<string, unknown>} */ (payload).liveId || '')
    .trim()
    .toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) {
    return { ok: false, error: 'metrics_invalid_live_id' };
  }
  if (!isPanelLiveSummary(payload, lid)) {
    return { ok: false, error: 'metrics_invalid_shape' };
  }
  return { ok: true, metrics: /** @type {Record<string, unknown>} */ (payload) };
}

/**
 * tabs.sendMessage の応答から panel サマリを取り出す（liveId 一致時のみ）。
 * @param {unknown} res
 * @param {string} [expectedLiveId]
 * @returns {Record<string, unknown>|null}
 */
export function resolvePanelMetricsFromMessageResponse(res, expectedLiveId) {
  if (!res || typeof res !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (res);
  if (r.ok !== true || !r.metrics || typeof r.metrics !== 'object') return null;
  const metrics = /** @type {Record<string, unknown>} */ (r.metrics);
  const expected = String(expectedLiveId || '').trim().toLowerCase();
  if (expected && !isPanelLiveSummary(metrics, expected)) return null;
  if (!expected && !isPanelLiveSummary(metrics)) return null;
  return metrics;
}
