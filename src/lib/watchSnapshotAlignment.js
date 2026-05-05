import {
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  watchPageUrlsMatchForSnapshot
} from './broadcastUrl.js';

/**
 * snapshot が「解決済み watch URL」と同じ放送由来かを判定する。
 * - lv が取れる場合は lv 優先で厳密判定
 * - lv が取れない（ch など）場合は URL 緩一致にフォールバック
 *
 * @param {unknown} snapshot
 * @param {string | null | undefined} watchUrl
 * @param {string | null | undefined} [candidateTabUrl]
 * @returns {boolean}
 */
export function snapshotLooksAlignedWithWatchUrl(
  snapshot,
  watchUrl,
  candidateTabUrl = ''
) {
  const watch = String(watchUrl || '').trim();
  if (!watch) return true;
  if (!snapshot || typeof snapshot !== 'object') return false;

  const expectedLv = extractLiveIdFromUrl(watch);
  const s = /** @type {Record<string, unknown>} */ (snapshot);
  const snapLiveId = extractLiveIdFromUrl(String(s.liveId || ''));
  const snapUrl = String(s.url || '').trim();
  const snapUrlLv = extractLiveIdFromUrl(snapUrl);
  const tabLv = extractLiveIdFromUrl(String(candidateTabUrl || ''));

  if (expectedLv) {
    if (snapLiveId && snapLiveId !== expectedLv) return false;
    if (snapUrlLv && snapUrlLv !== expectedLv) return false;
    if (tabLv && tabLv !== expectedLv) return false;

    if (snapLiveId === expectedLv) return true;
    if (snapUrlLv === expectedLv) return true;
    if (tabLv === expectedLv) return true;

    if (snapUrl) {
      return watchPageUrlsMatchForSnapshot(snapUrl, watch);
    }
    return true;
  }

  if (snapUrl && isNicoLiveWatchUrl(snapUrl) && isNicoLiveWatchUrl(watch)) {
    return watchPageUrlsMatchForSnapshot(snapUrl, watch);
  }
  return true;
}
