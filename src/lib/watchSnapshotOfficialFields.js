/**
 * collectWatchPageSnapshot が返すオブジェクトのうち、公式統計・キャプチャ率まわり（DOM 非依存）。
 *
 * @param {{
 *   nowMs: number,
 *   officialViewerCount: unknown,
 *   officialCommentCount: unknown,
 *   officialStatsUpdatedAt: number,
 *   officialCommentStatsUpdatedAt?: number,
 *   officialViewerIntervalMs: unknown,
 *   officialAdPointsNdgr?: unknown,
 *   officialGiftPointsNdgr?: unknown,
 *   officialEventGiftScoreNdgr?: unknown,
 *   officialNicoEventRankNdgr?: unknown,
 *   officialNicoEventTitleNdgr?: unknown,
 *   officialNdgrStatsUpdatedAt?: number,
 *   officialCommentSummary: {
 *     statisticsCommentsDelta?: number|null,
 *     receivedCommentsDelta?: number|null,
 *     sampleWindowMs?: number|null,
 *     captureRatio?: number|null
 *   }|null|undefined
 * }} p
 * @returns {{
 *   officialViewerCount: number|null,
 *   officialCommentCount: number|null,
 *   officialStatsUpdatedAt: number|null,
 *   officialStatsFreshnessMs: number|null,
 *   officialCommentStatsUpdatedAt: number|null,
 *   officialCommentStatsFreshnessMs: number|null,
 *   officialViewerIntervalMs: number|null,
 *   officialStatisticsCommentsDelta: number|null,
 *   officialReceivedCommentsDelta: number|null,
 *   officialCommentSampleWindowMs: number|null,
 *   officialCaptureRatio: number|null,
 *   officialAdPointsNdgr: number|null,
 *   officialGiftPointsNdgr: number|null,
 *   officialEventGiftScoreNdgr: number|null,
 *   officialNicoEventRankNdgr: number|null,
 *   officialNicoEventTitleNdgr: string|null,
 *   officialNdgrStatsUpdatedAt: number|null,
 *   officialNdgrStatsFreshnessMs: number|null
 * }}
 */
export function buildWatchSnapshotOfficialFields(p) {
  const {
    nowMs,
    officialViewerCount,
    officialCommentCount,
    officialStatsUpdatedAt,
    officialCommentStatsUpdatedAt: ocStatsAtRaw,
    officialViewerIntervalMs,
    officialCommentSummary,
    officialAdPointsNdgr: adRaw,
    officialGiftPointsNdgr: giftRaw,
    officialEventGiftScoreNdgr: evGiftRaw,
    officialNicoEventRankNdgr: rankRaw,
    officialNicoEventTitleNdgr: titleRaw,
    officialNdgrStatsUpdatedAt: ndgrAtRaw
  } = p;
  const officialCommentStatsUpdatedAt =
    typeof ocStatsAtRaw === 'number' && Number.isFinite(ocStatsAtRaw) && ocStatsAtRaw > 0
      ? ocStatsAtRaw
      : 0;

  /** @param {unknown} v @returns {number|null} */
  const nnInt = (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

  const officialNdgrStatsUpdatedAt =
    typeof ndgrAtRaw === 'number' && Number.isFinite(ndgrAtRaw) && ndgrAtRaw > 0
      ? ndgrAtRaw
      : 0;

  const titleTrim = String(titleRaw || '').trim();
  const officialNicoEventTitleNdgr =
    titleTrim.length > 0 ? titleTrim.slice(0, 200) : null;

  return {
    officialViewerCount:
      typeof officialViewerCount === 'number' &&
      Number.isFinite(officialViewerCount) &&
      officialViewerCount >= 0
        ? officialViewerCount
        : null,
    officialCommentCount:
      typeof officialCommentCount === 'number' &&
      Number.isFinite(officialCommentCount) &&
      officialCommentCount >= 0
        ? officialCommentCount
        : null,
    officialStatsUpdatedAt:
      officialStatsUpdatedAt > 0 ? officialStatsUpdatedAt : null,
    officialStatsFreshnessMs:
      officialStatsUpdatedAt > 0
        ? Math.max(0, nowMs - officialStatsUpdatedAt)
        : null,
    officialCommentStatsUpdatedAt:
      officialCommentStatsUpdatedAt > 0 ? officialCommentStatsUpdatedAt : null,
    officialCommentStatsFreshnessMs:
      officialCommentStatsUpdatedAt > 0
        ? Math.max(0, nowMs - officialCommentStatsUpdatedAt)
        : null,
    officialViewerIntervalMs:
      typeof officialViewerIntervalMs === 'number' && officialViewerIntervalMs > 0
        ? officialViewerIntervalMs
        : null,
    officialStatisticsCommentsDelta:
      officialCommentSummary?.statisticsCommentsDelta ?? null,
    officialReceivedCommentsDelta:
      officialCommentSummary?.receivedCommentsDelta ?? null,
    officialCommentSampleWindowMs:
      officialCommentSummary?.sampleWindowMs ?? null,
    officialCaptureRatio:
      typeof officialCommentSummary?.captureRatio === 'number'
        ? officialCommentSummary.captureRatio
        : null,
    officialAdPointsNdgr: nnInt(adRaw),
    officialGiftPointsNdgr: nnInt(giftRaw),
    officialEventGiftScoreNdgr: nnInt(evGiftRaw),
    officialNicoEventRankNdgr: nnInt(rankRaw),
    officialNicoEventTitleNdgr,
    officialNdgrStatsUpdatedAt:
      officialNdgrStatsUpdatedAt > 0 ? officialNdgrStatsUpdatedAt : null,
    officialNdgrStatsFreshnessMs:
      officialNdgrStatsUpdatedAt > 0
        ? Math.max(0, nowMs - officialNdgrStatsUpdatedAt)
        : null
  };
}
