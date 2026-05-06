import {
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  watchPageUrlsMatchForSnapshot
} from './broadcastUrl.js';

/**
 * 0.1.178: content script からの応答（intercept cache export / AI 共有診断 等）が
 * 「現在解決済の watch URL」と同じ放送由来かを判定する。
 * 別 live のタブから誤って受け取ったデータの混入を防ぐ生成ガード。
 *
 * snapshot 専用の `snapshotLooksAlignedWithWatchUrl` を NLS_* 応答全般に拡張した
 * generic 版。応答に `liveId` または `frameHref` が含まれていれば lv 比較する。
 *
 * @param {{ liveId?: unknown, frameHref?: unknown } | null | undefined} response
 * @param {string | null | undefined} watchUrl
 * @returns {boolean} true なら採用してよい、false なら破棄すべき
 */
export function responseAlignedWithWatchUrl(response, watchUrl) {
  const watch = String(watchUrl || '').trim();
  if (!watch) return true;
  const expectedLv = extractLiveIdFromUrl(watch);
  if (!expectedLv) return true; // ch 等で lv が抽出できない場合は緩く通す
  if (!response || typeof response !== 'object') return true;
  const r = /** @type {{ liveId?: unknown, frameHref?: unknown }} */ (response);
  const respLv = extractLiveIdFromUrl(String(r.liveId || ''));
  const frameLv = extractLiveIdFromUrl(String(r.frameHref || ''));
  if (respLv && respLv !== expectedLv) return false;
  if (frameLv && frameLv !== expectedLv) return false;
  return true;
}

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
