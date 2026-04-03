/**
 * watch ページ URL と直前の lv から、コンテンツスクリプト用の文脈を純関数で求める
 */

import { extractLiveIdFromUrl, isNicoLiveWatchUrl } from './broadcastUrl.js';

/**
 * @param {string|null|undefined} previousLiveId
 * @returns {string|null}
 */
function normalizeLiveId(previousLiveId) {
  if (previousLiveId == null) return null;
  const s = String(previousLiveId).trim().toLowerCase();
  return s || null;
}

/**
 * @param {string} href  location.href 相当
 * @param {string|null|undefined} previousLiveId  直前に保持していた lv（同一タブ内）
 * @returns {{ liveId: string|null, isWatchPage: boolean, liveIdChanged: boolean }}
 */
export function resolveWatchPageContext(href, previousLiveId) {
  const isWatchPage = isNicoLiveWatchUrl(href);
  const liveId = isWatchPage ? extractLiveIdFromUrl(href) : null;
  const prev = normalizeLiveId(previousLiveId);
  const liveIdChanged = prev !== liveId;
  return { liveId, isWatchPage, liveIdChanged };
}
