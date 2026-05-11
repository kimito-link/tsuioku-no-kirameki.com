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
 * @returns {{ liveId: string|null, isWatchPage: boolean, liveIdChanged: boolean, liveIdSwitched: boolean }}
 *
 * - `liveIdChanged`: 「prev と liveId が違う」（初回起動 / 視聴離脱 / 別 lv 切替 のいずれでも true）
 *   既存 callers との互換性のため意味は変えない。
 * - `liveIdSwitched`: v0.1.247 追加。「**両者 non-null** かつ別 lv に切り替わった」のみ true。
 *   SPA navigation 中の一時的 URL parse 失敗 (lv → null) で false positive を起こさない。
 *   `interceptedNicknames.clear()` 等の破壊的 reset 用途は本 flag を使うこと。
 */
export function resolveWatchPageContext(href, previousLiveId) {
  const isWatchPage = isNicoLiveWatchUrl(href);
  const liveId = isWatchPage ? extractLiveIdFromUrl(href) : null;
  const prev = normalizeLiveId(previousLiveId);
  const liveIdChanged = prev !== liveId;
  // v0.1.247: false positive clear を防ぐ厳格 flag。memory `todo_ndgr_username_resolution.md`
  //   の「interceptNicknameSize 109 → 56 に減少」バグの根本原因は、prev → null の遷移でも
  //   `liveIdChanged: true` になり map clear が発火していたこと。両者 non-null かつ別 lv
  //   の時だけ「明示的な切替」と判定する。
  const liveIdSwitched = prev != null && liveId != null && prev !== liveId;
  return { liveId, isWatchPage, liveIdChanged, liveIdSwitched };
}
