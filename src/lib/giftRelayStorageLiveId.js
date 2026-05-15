/**
 * ギフト sub-app iframe からの postMessage を storage に書くときの liveId 解決。
 *
 * content script のモジュール変数 `liveId` は同期タイミングによってまだ null のことがあり、
 * その状態で relay を受けると `nls_gift_history_throws_<lv>` へ一度も書けず、
 * 北極星「ギフト履歴」レーンと応援帯が NDGR 由来の「回」フォールバックだけになる。
 * `frameUrl`（例: https://gift.nicovideo.jp/live/lv350532706/purchase?...）に含まれる lv を
 * フォールバックとして使う。
 */

import { extractLiveIdFromUrl } from './broadcastUrl.js';

/**
 * @param {string|null|undefined} moduleLiveId content-entry の watch 文脈 liveId
 * @param {string|null|undefined} frameUrl relay payload の frameUrl
 * @returns {string} 小文字の lv… または空
 */
export function resolveGiftRelayStorageLiveId(moduleLiveId, frameUrl) {
  const a = String(moduleLiveId || '').trim().toLowerCase();
  if (a) return a;
  const fromFrame = extractLiveIdFromUrl(String(frameUrl || ''));
  return fromFrame ? String(fromFrame).trim().toLowerCase() : '';
}
