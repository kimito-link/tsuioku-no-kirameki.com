// dev monitor セカンダリ可視化（renderDevMonitorSecondaryViz の <div class="nl-dev-monitor-viz">）の
//   HTML を組む純関数。popup-entry.js から「snapshot/件数/trend → viz HTML 文字列」部分だけ抽出
//   （pure refactor・挙動不変）。DOM 取得($('devMonitorViz'))・trend の読み出し(readTrendSeries)・
//   空 liveId の早期 return・innerHTML 代入は popup に残す。
//   各バー/スパークラインの builder は既存 lib（devMonitorViz / devMonitorTrendSession）を流用＝循環なし。
import {
  officialVsRecordedBarState,
  htmlOfficialVsRecordedBar,
  htmlCaptureRatioBar,
  profileGapBarSeries,
  htmlProfileGapBars,
  commentTypeDistribution,
  htmlCommentTypeBars,
  wsStalenessState,
  htmlWsStalenessBar,
  htmlAcquisitionSparklines,
  htmlDualCountSparklines
} from './devMonitorViz.js';
import { trendToSparklineArrays, trendHasCountSamples } from './devMonitorTrendSession.js';

/**
 * dev monitor の可視化ブロック HTML を組む。snapshot のフィールドガードは抽出前と同一。
 *
 * @param {{
 *   snapshot: import('../extension/popup-entry.js').WatchPageSnapshot | null | undefined,
 *   displayCount: number,
 *   storageCount: number,
 *   profileGaps?: import('./devMonitorAvatarStats.js').StoredCommentProfileGaps | null,
 *   trend?: any[],
 *   persisted?: boolean
 * }} input
 * @returns {string} `<div class="nl-dev-monitor-viz">…</div>` 文字列
 */
export function buildDevMonitorVizHtml(input) {
  const p = /** @type {Record<string, any>} */ (
    input && typeof input === 'object' ? input : {}
  );
  const snap = p.snapshot;
  const trend = Array.isArray(p.trend) ? p.trend : [];
  const persisted = Boolean(p.persisted);

  const oc =
    snap &&
    typeof snap.officialCommentCount === 'number' &&
    Number.isFinite(snap.officialCommentCount)
      ? snap.officialCommentCount
      : null;

  /** @type {string[]} */
  const parts = [];
  parts.push(
    htmlOfficialVsRecordedBar(
      officialVsRecordedBarState({
        displayCount: p.displayCount,
        officialCount: oc
      })
    )
  );
  if (
    snap &&
    typeof snap.officialCaptureRatio === 'number' &&
    Number.isFinite(snap.officialCaptureRatio)
  ) {
    parts.push(htmlCaptureRatioBar(snap.officialCaptureRatio));
  }
  const gaps = p.profileGaps;
  if (gaps && p.storageCount > 0) {
    parts.push(htmlProfileGapBars(profileGapBarSeries(gaps)));
  }
  const dbg =
    snap && snap._debug && typeof snap._debug === 'object'
      ? /** @type {Record<string, unknown>} */ (snap._debug)
      : null;
  if (
    dbg &&
    dbg.commentTypeVisibleSample != null &&
    typeof dbg.commentTypeVisibleSample === 'object'
  ) {
    parts.push(
      htmlCommentTypeBars(
        commentTypeDistribution(
          /** @type {Record<string, unknown>} */ (dbg.commentTypeVisibleSample)
        )
      )
    );
  }
  if (dbg && typeof dbg.wsAge === 'number') {
    parts.push(htmlWsStalenessBar(wsStalenessState(dbg.wsAge)));
  }
  if (trend.length >= 1) {
    const series = trendToSparklineArrays(trend);
    parts.push(htmlAcquisitionSparklines(series, { persisted }));
    if (trendHasCountSamples(trend)) {
      parts.push(htmlDualCountSparklines(series.displaySeries, series.storageSeries));
    }
  }
  return `<div class="nl-dev-monitor-viz">${parts.filter(Boolean).join('')}</div>`;
}
