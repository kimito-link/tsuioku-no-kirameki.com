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
 *   officialCommentSummary: {
 *     statisticsCommentsDelta?: number|null,
 *     receivedCommentsDelta?: number|null,
 *     sampleWindowMs?: number|null,
 *     captureRatio?: number|null
 *   }|null|undefined,
 *   officialGiftPoints?: unknown,
 *   officialAdPoints?: unknown,
 *   officialGiftAdStatsUpdatedAt?: number
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
 *   officialGiftPoints: number|null,
 *   officialAdPoints: number|null,
 *   officialGiftAdStatsUpdatedAt: number|null,
 *   officialGiftAdStatsFreshnessMs: number|null
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
    officialGiftPoints: giftRaw,
    officialAdPoints: adRaw,
    officialGiftAdStatsUpdatedAt: giftAdAtRaw
  } = p;
  const officialCommentStatsUpdatedAt =
    typeof ocStatsAtRaw === 'number' && Number.isFinite(ocStatsAtRaw) && ocStatsAtRaw > 0
      ? ocStatsAtRaw
      : 0;
  const officialGiftAdStatsUpdatedAt =
    typeof giftAdAtRaw === 'number' && Number.isFinite(giftAdAtRaw) && giftAdAtRaw > 0
      ? giftAdAtRaw
      : 0;

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
    officialGiftPoints:
      typeof giftRaw === 'number' && Number.isFinite(giftRaw) && giftRaw >= 0
        ? giftRaw
        : null,
    officialAdPoints:
      typeof adRaw === 'number' && Number.isFinite(adRaw) && adRaw >= 0 ? adRaw : null,
    officialGiftAdStatsUpdatedAt:
      officialGiftAdStatsUpdatedAt > 0 ? officialGiftAdStatsUpdatedAt : null,
    officialGiftAdStatsFreshnessMs:
      officialGiftAdStatsUpdatedAt > 0
        ? Math.max(0, nowMs - officialGiftAdStatsUpdatedAt)
        : null
  };
}
