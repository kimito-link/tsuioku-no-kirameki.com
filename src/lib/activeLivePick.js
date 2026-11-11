/**
 * activeLivePick.js — いま見ている配信の lv を、ニコ生と他サービスの記録から選ぶ。
 * YouTube・Twitch・Kick などは yt_last_stream_url の配信キーを疑似 lv にする。
 * コメビュの画面内 shim を通らない拡張のページからも同じ答えになる。
 */
import { extractLiveIdFromUrl } from './broadcastUrl.js';
import { computePseudoLvForVideoId } from './youtube/ytPseudoLv.js';

/** extension-youtube/src/pfLastStreamUrl.js と同じキー。 */
export const YT_LAST_STREAM_URL_KEY = 'yt_last_stream_url';

/**
 * @param {unknown} key
 * @returns {string}
 */
export function liveIdFromStreamKey(key) {
  const id = String(key || '').trim();
  if (!id) return '';
  const lv = computePseudoLvForVideoId(id);
  return /^lv\d{1,15}$/.test(lv) ? lv : '';
}

/**
 * ニコ生の URL と、他サービスの最後の配信の、新しい方を返す。
 * 時刻が両方無ければニコ生を優先する（URL だけ残っている古い他サービスに引っ張られない）。
 * @param {{ nicoUrl?: unknown, streamKey?: unknown, streamAt?: unknown, nicoAt?: unknown }} input
 * @returns {string}
 */
export function pickActiveLiveId(input) {
  const src = input && typeof input === 'object' ? input : {};
  const nico = extractLiveIdFromUrl(String(/** @type {any} */ (src).nicoUrl || '')) || '';
  const streamLv = liveIdFromStreamKey(/** @type {any} */ (src).streamKey);
  if (nico && streamLv && nico !== streamLv) {
    const streamAt = Number(/** @type {any} */ (src).streamAt) || 0;
    const nicoAt = Number(/** @type {any} */ (src).nicoAt) || 0;
    if (streamAt > 0 || nicoAt > 0) return streamAt >= nicoAt ? streamLv : nico;
    return nico;
  }
  return nico || streamLv || '';
}
