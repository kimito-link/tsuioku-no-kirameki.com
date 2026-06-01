/**
 * watch スナップショット（content-entry の collectWatchPageSnapshot 戻り、popup へ送るのと
 * 同じ形）から、同接推定 resolveConcurrentViewers の入力を組み立てて resolved を返す純関数。
 *
 * buildWatchMetaCardAudienceViewModel が popup 内で行っている resolved 算出の入力マッピングを
 * 1 箇所に切り出したもの。content-entry の較正ロガー（popup 非依存・背景巡回タブでも記録）が
 * 同じ式で resolved を得るために使う。drift 防止のため popup 側と同じ snapshot フィールドを参照する。
 */

import { resolveConcurrentViewers } from './concurrentEstimate.js';

/** @param {unknown} v @returns {number|undefined} */
function numOrUndef(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * 研究中シグナル D 用：公式 statistics コメント増分 ÷ サンプル窓（分）でコメ/分を近似。
 * @param {Record<string, any>|null|undefined} snapshot
 * @returns {number|undefined}
 */
export function deriveCommentsPerMinFromSnapshot(snapshot) {
  const s = snapshot || {};
  const delta = s.officialStatisticsCommentsDelta;
  const winMs = s.officialCommentSampleWindowMs;
  if (
    typeof delta === 'number' &&
    Number.isFinite(delta) &&
    delta > 0 &&
    typeof winMs === 'number' &&
    Number.isFinite(winMs) &&
    winMs > 0
  ) {
    return delta / (winMs / 60000);
  }
  return undefined;
}

/**
 * @param {Record<string, any>|null|undefined} snapshot
 * @param {number} [nowMs]
 * @returns {ReturnType<typeof resolveConcurrentViewers>}
 */
export function resolveConcurrentFromSnapshot(snapshot, nowMs) {
  const s = snapshot || {};
  const vc = s.viewerCountFromDom;
  const hasOfficialCommentCount =
    typeof s.officialCommentCount === 'number' && Number.isFinite(s.officialCommentCount);
  const hasStatsDelta =
    typeof s.officialStatisticsCommentsDelta === 'number' &&
    Number.isFinite(s.officialStatisticsCommentsDelta);

  return resolveConcurrentViewers({
    nowMs: typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now(),
    officialViewers: numOrUndef(s.officialViewerCount),
    officialUpdatedAtMs: numOrUndef(s.officialStatsUpdatedAt),
    officialViewerIntervalMs:
      typeof s.officialViewerIntervalMs === 'number' &&
      Number.isFinite(s.officialViewerIntervalMs) &&
      s.officialViewerIntervalMs > 0
        ? s.officialViewerIntervalMs
        : undefined,
    previousStatisticsComments:
      hasOfficialCommentCount && hasStatsDelta
        ? Math.max(0, s.officialCommentCount - s.officialStatisticsCommentsDelta)
        : undefined,
    currentStatisticsComments: hasOfficialCommentCount ? s.officialCommentCount : undefined,
    receivedCommentsDelta: numOrUndef(s.officialReceivedCommentsDelta),
    recentActiveUsers: typeof s.recentActiveUsers === 'number' ? s.recentActiveUsers : 0,
    totalVisitors: typeof vc === 'number' && vc > 0 ? vc : undefined,
    streamAgeMin:
      typeof s.streamAgeMin === 'number' && s.streamAgeMin >= 0 ? s.streamAgeMin : undefined,
    commentsPerMin: deriveCommentsPerMinFromSnapshot(s)
  });
}
