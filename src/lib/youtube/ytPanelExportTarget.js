/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】横の欄が指している配信と、書き出す記録の対応
 * 【書けるstorageキー】なし
 *
 * 横の欄は stream=twitch:sasatikk のように「どの配信か」を焼いて開く。
 * そのタブが閉じたあと、開いている別の配信や、最後に更新された別のサービスを書き出してはいけない。
 */

import { STREAM_PLATFORMS, isPlaceholderStreamKey } from '../platform/streamPlatform.js';

/**
 * 横の欄のキー(yt:動画id / twitch:login)と、記録の配信キーが同じ配信か。
 * 仮のキー(記録の無い部屋)も、その配信のタブとしては同じ側に置く。
 * @param {unknown} panelStreamKey
 * @param {unknown} streamKey
 */
export function streamKeyMatchesPanel(panelStreamKey, streamKey) {
  const panel = String(panelStreamKey || '');
  const key = String(streamKey || '');
  if (!panel || !key) return false;
  if (panel.startsWith('yt:')) return key === panel.slice(3);
  const colon = panel.indexOf(':');
  if (colon < 1) return false;
  const plat = STREAM_PLATFORMS[/** @type {keyof typeof STREAM_PLATFORMS} */ (panel.slice(0, colon))];
  const login = panel.slice(colon + 1);
  if (!plat || !login) return false;
  const head = plat.keyHead;
  return (key.startsWith(`${head}${login}.`) || key.startsWith(`${head}${login.toLowerCase()}.`))
    && (plat.isStreamKey(key) || isPlaceholderStreamKey(key));
}

/**
 * 横の欄が指す配信の、このPCにあるいちばん新しい記録。別のサービスの記録は返さない。
 * 開いているタブは見ない。タブが閉じていても、記録があればそのキーを返す。記録が無ければ ''。
 * @param {unknown} panelStreamKey
 * @param {Record<string, { updatedAt?: number }> | null | undefined} summaries
 * @returns {string}
 */
export function recordingKeyForPanelStream(panelStreamKey, summaries) {
  const panel = String(panelStreamKey || '');
  const bag = summaries && typeof summaries === 'object' ? summaries : {};
  if (!panel) return '';
  if (panel.startsWith('yt:')) {
    const vid = panel.slice(3);
    return vid && Object.prototype.hasOwnProperty.call(bag, vid) ? vid : '';
  }
  const colon = panel.indexOf(':');
  if (colon < 1) return '';
  const plat = STREAM_PLATFORMS[/** @type {keyof typeof STREAM_PLATFORMS} */ (panel.slice(0, colon))];
  const login = panel.slice(colon + 1);
  if (!plat || !login) return '';
  const heads = [`${plat.keyHead}${login}.`, `${plat.keyHead}${login.toLowerCase()}.`];
  let best = '';
  let bestAt = -1;
  for (const [id, sum] of Object.entries(bag)) {
    if (!heads.some((head) => id.startsWith(head))) continue;
    if (!plat.isStreamKey(id) || isPlaceholderStreamKey(id)) continue;
    const at = Number(sum?.updatedAt || 0);
    if (at >= bestAt) {
      bestAt = at;
      best = id;
    }
  }
  return best;
}
