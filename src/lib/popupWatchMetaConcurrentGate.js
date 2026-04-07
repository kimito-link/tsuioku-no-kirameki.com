import {
  concurrentEstimateIsSparseSignal,
  shouldShowConcurrentEstimate
} from './popupConcurrentEstimateGate.js';

/**
 * @typedef {{
 *   viewerCountFromDom?: number|null,
 *   recentActiveUsers?: number,
 *   officialViewerCount?: number|null,
 *   liveId?: string
 * }} WatchMetaConcurrentSnapshot
 */

/**
 * `renderWatchMetaCard` と同一入力で同接カードの表示可否・sparse 判定を返す（単一ソース化）。
 *
 * @param {WatchMetaConcurrentSnapshot|null|undefined} snapshot WatchPageSnapshot 互換の最小形
 * @returns {{ showConcurrent: boolean, sparseConcurrent: boolean }}
 */
export function watchMetaConcurrentGateFromSnapshot(snapshot) {
  if (!snapshot) {
    return { showConcurrent: false, sparseConcurrent: true };
  }
  const vc = snapshot.viewerCountFromDom;
  const recentActive =
    typeof snapshot.recentActiveUsers === 'number' ? snapshot.recentActiveUsers : 0;
  const showConcurrent = shouldShowConcurrentEstimate({
    recentActiveUsers: recentActive,
    officialViewerCount: snapshot.officialViewerCount,
    viewerCountFromDom: vc,
    liveId: snapshot.liveId
  });
  const sparseConcurrent = concurrentEstimateIsSparseSignal({
    recentActiveUsers: recentActive,
    officialViewerCount: snapshot.officialViewerCount,
    viewerCountFromDom: vc
  });
  return { showConcurrent, sparseConcurrent };
}
