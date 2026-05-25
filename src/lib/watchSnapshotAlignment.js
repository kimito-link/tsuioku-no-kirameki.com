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
 * generic 版。応答に `liveId` または `frameHref` が含まれていれば
 * `extractLiveIdFromUrl`（`lv…` / `ch…`）で比較する。
 *
 * @param {{ liveId?: unknown, frameHref?: unknown } | null | undefined} response
 * @param {string | null | undefined} watchUrl
 * @returns {boolean} true なら採用してよい、false なら破棄すべき
 */
export function responseAlignedWithWatchUrl(response, watchUrl) {
  const watch = String(watchUrl || '').trim();
  if (!watch) return true;
  const expectedBv = extractLiveIdFromUrl(watch);
  if (!expectedBv) return true; // pathname から lv/ch が抽出できない場合は緩く通す
  if (!response || typeof response !== 'object') return true;
  const r = /** @type {{ liveId?: unknown, frameHref?: unknown }} */ (response);
  const respBv = extractLiveIdFromUrl(String(r.liveId || ''));
  const frameBv = extractLiveIdFromUrl(String(r.frameHref || ''));
  if (respBv && respBv !== expectedBv) return false;
  if (frameBv && frameBv !== expectedBv) return false;
  return true;
}

/**
 * snapshot が「解決済み watch URL」と同じ放送由来かを判定する。
 * - lv / ch が URL から取れる場合は放送 ID 優先で厳密判定
 * - 取れない場合は URL 緩一致にフォールバック
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

  const expectedBv = extractLiveIdFromUrl(watch);
  const s = /** @type {Record<string, unknown>} */ (snapshot);
  const snapLiveId = extractLiveIdFromUrl(String(s.liveId || ''));
  const snapUrl = String(s.url || '').trim();
  const snapUrlBv = extractLiveIdFromUrl(snapUrl);
  const tabBv = extractLiveIdFromUrl(String(candidateTabUrl || ''));

  if (expectedBv) {
    if (snapLiveId && snapLiveId !== expectedBv) return false;
    if (snapUrlBv && snapUrlBv !== expectedBv) return false;
    if (tabBv && tabBv !== expectedBv) return false;

    if (snapLiveId === expectedBv) return true;
    if (snapUrlBv === expectedBv) return true;

    if (snapUrl) {
      return watchPageUrlsMatchForSnapshot(snapUrl, watch);
    }
    // タブ URL だけ一致で snapshot に lv/url 証拠が無い「同タブ別 iframe」の
    // 空応答を誤採用しない（popup が数値「—」固定になる原因になりうる）。
    return false;
  }

  if (snapUrl && isNicoLiveWatchUrl(snapUrl) && isNicoLiveWatchUrl(watch)) {
    return watchPageUrlsMatchForSnapshot(snapUrl, watch);
  }
  return true;
}
