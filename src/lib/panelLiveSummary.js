/**
 * パネルカード用の超軽量サマリ（多タブ時の snapshot / 巨大配列 read 待ちを避ける）。
 * `nls_csummary_`（件数・直近コメ）に加え、来場・同接の速報も載せる。
 *
 * @module panelLiveSummary
 */

import {
  buildCommentSummary,
  COMMENT_SUMMARY_VERSION,
  isCommentSummary,
  normalizeSummaryRecentRows,
  SUMMARY_RECENT_ROWS_MAX
} from './commentSummary.js';

export const PANEL_SUMMARY_VERSION = COMMENT_SUMMARY_VERSION;

/**
 * @param {string} liveId
 * @returns {string}
 */
export function panelSummaryStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_panel_summary_${id}`;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteNonNegativeOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteNonNegativeNumberOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * @param {{
 *   liveId?: string,
 *   recordedCount?: number,
 *   officialCount?: number|null,
 *   viewerCountFromDom?: number|null,
 *   officialViewerCount?: number|null,
 *   concurrentEstimated?: number|null,
 *   recentActiveUsers?: number|null,
 *   streamAgeMin?: number|null,
 *   officialStatsUpdatedAt?: number|null,
 *   officialStatsFreshnessMs?: number|null,
 *   officialCommentStatsUpdatedAt?: number|null,
 *   officialCommentStatsFreshnessMs?: number|null,
 *   officialViewerIntervalMs?: number|null,
 *   officialStatisticsCommentsDelta?: number|null,
 *   officialReceivedCommentsDelta?: number|null,
 *   officialCommentSampleWindowMs?: number|null,
 *   officialCaptureRatio?: number|null,
 *   lastIngestAt?: number|null,
 *   recentRows?: Array<Record<string, unknown>>,
 *   nowMs?: number
 * }} [opts]
 */
export function buildPanelLiveSummary(opts = {}) {
  const base = buildCommentSummary({
    liveId: opts.liveId,
    recordedCount: opts.recordedCount,
    officialCount: opts.officialCount,
    lastIngestAt: opts.lastIngestAt,
    recentRows: opts.recentRows,
    nowMs: opts.nowMs
  });
  return {
    ...base,
    viewerCountFromDom: finiteNonNegativeOrNull(opts.viewerCountFromDom),
    officialViewerCount: finiteNonNegativeOrNull(opts.officialViewerCount),
    concurrentEstimated: finiteNonNegativeOrNull(opts.concurrentEstimated),
    recentActiveUsers: finiteNonNegativeOrNull(opts.recentActiveUsers),
    streamAgeMin: finiteNonNegativeOrNull(opts.streamAgeMin),
    officialStatsUpdatedAt: finiteNonNegativeOrNull(opts.officialStatsUpdatedAt),
    officialStatsFreshnessMs: finiteNonNegativeOrNull(opts.officialStatsFreshnessMs),
    officialCommentStatsUpdatedAt: finiteNonNegativeOrNull(
      opts.officialCommentStatsUpdatedAt
    ),
    officialCommentStatsFreshnessMs: finiteNonNegativeOrNull(
      opts.officialCommentStatsFreshnessMs
    ),
    officialViewerIntervalMs: finiteNonNegativeOrNull(opts.officialViewerIntervalMs),
    officialStatisticsCommentsDelta: finiteNonNegativeOrNull(
      opts.officialStatisticsCommentsDelta
    ),
    officialReceivedCommentsDelta: finiteNonNegativeOrNull(
      opts.officialReceivedCommentsDelta
    ),
    officialCommentSampleWindowMs: finiteNonNegativeOrNull(
      opts.officialCommentSampleWindowMs
    ),
    officialCaptureRatio: finiteNonNegativeNumberOrNull(opts.officialCaptureRatio)
  };
}

/**
 * @param {unknown} obj
 * @param {string} [liveId]
 * @returns {boolean}
 */
export function isPanelLiveSummary(obj, liveId) {
  if (!isCommentSummary(obj, liveId)) return false;
  return true;
}

/**
 * popup の watch カード向けに最小 snapshot 形へ変換する。
 * @param {ReturnType<typeof buildPanelLiveSummary>} summary
 * @returns {Record<string, unknown>|null}
 */
export function watchSnapshotFromPanelSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const s = /** @type {Record<string, unknown>} */ (summary);
  const lid = String(s.liveId || '').trim().toLowerCase();
  if (!lid) return null;
  return {
    liveId: lid,
    officialCommentCount:
      typeof s.officialCount === 'number' && Number.isFinite(s.officialCount)
        ? s.officialCount
        : null,
    viewerCountFromDom:
      typeof s.viewerCountFromDom === 'number' && Number.isFinite(s.viewerCountFromDom)
        ? s.viewerCountFromDom
        : null,
    officialViewerCount:
      typeof s.officialViewerCount === 'number' && Number.isFinite(s.officialViewerCount)
        ? s.officialViewerCount
        : null,
    recentActiveUsers:
      typeof s.recentActiveUsers === 'number' && Number.isFinite(s.recentActiveUsers)
        ? s.recentActiveUsers
        : 0,
    streamAgeMin:
      typeof s.streamAgeMin === 'number' && Number.isFinite(s.streamAgeMin)
        ? s.streamAgeMin
        : null,
    officialStatsUpdatedAt:
      typeof s.officialStatsUpdatedAt === 'number' &&
      Number.isFinite(s.officialStatsUpdatedAt)
        ? s.officialStatsUpdatedAt
        : null,
    officialStatsFreshnessMs:
      typeof s.officialStatsFreshnessMs === 'number' &&
      Number.isFinite(s.officialStatsFreshnessMs)
        ? s.officialStatsFreshnessMs
        : null,
    officialCommentStatsUpdatedAt:
      typeof s.officialCommentStatsUpdatedAt === 'number' &&
      Number.isFinite(s.officialCommentStatsUpdatedAt)
        ? s.officialCommentStatsUpdatedAt
        : null,
    officialCommentStatsFreshnessMs:
      typeof s.officialCommentStatsFreshnessMs === 'number' &&
      Number.isFinite(s.officialCommentStatsFreshnessMs)
        ? s.officialCommentStatsFreshnessMs
        : null,
    officialViewerIntervalMs:
      typeof s.officialViewerIntervalMs === 'number' &&
      Number.isFinite(s.officialViewerIntervalMs)
        ? s.officialViewerIntervalMs
        : null,
    officialStatisticsCommentsDelta:
      typeof s.officialStatisticsCommentsDelta === 'number' &&
      Number.isFinite(s.officialStatisticsCommentsDelta)
        ? s.officialStatisticsCommentsDelta
        : null,
    officialReceivedCommentsDelta:
      typeof s.officialReceivedCommentsDelta === 'number' &&
      Number.isFinite(s.officialReceivedCommentsDelta)
        ? s.officialReceivedCommentsDelta
        : null,
    officialCommentSampleWindowMs:
      typeof s.officialCommentSampleWindowMs === 'number' &&
      Number.isFinite(s.officialCommentSampleWindowMs)
        ? s.officialCommentSampleWindowMs
        : null,
    officialCaptureRatio:
      typeof s.officialCaptureRatio === 'number' &&
      Number.isFinite(s.officialCaptureRatio)
        ? s.officialCaptureRatio
        : null,
    title: '',
    broadcasterName: ''
  };
}

export { normalizeSummaryRecentRows, SUMMARY_RECENT_ROWS_MAX };
