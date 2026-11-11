/**
 * YouTube・Twitch・Kick などのチャット1件を、OBSの中継が既に送っている形にする。
 * 配信キーは疑似の lv にする。サーバーは lv と数字の形だけを受け取る。ニコ生専用の項目は足さない。
 *
 * 【層】L0 判定層(純粋関数・I/O禁止)
 */

import { buildLiveEventsTail } from './liveEvents.js';
import { computePseudoLvForVideoId } from './youtube/ytPseudoLv.js';

/**
 * @param {any} item
 * @param {number} nowMs
 * @returns {any | null}
 */
export function serviceItemToMirrorRow(item, nowMs) {
  if (!item || typeof item !== 'object' || item.replay === true) return null;
  const name = String(item.name || '').trim().slice(0, 64);
  const text = String(item.text || item.giftName || '').trim().slice(0, 200);
  if (!name && !text) return null;
  const at = Number(item.postedAtMs || item.seenAt || item.recordedAt || nowMs);
  const icon = String(item.iconUrl || item.avatarUrl || '');
  const kind = String(item.kind || 'text');
  return {
    no: String(item.id || '').slice(0, 80),
    at: Number.isFinite(at) && at > 0 ? Math.floor(at) : nowMs,
    name,
    text,
    avatarUrl: /^https:\/\/[^\s"'<>]+$/.test(icon) ? icon.slice(0, 400) : '',
    userId: String(item.channelId || '').slice(0, 40),
    kind: kind && kind !== 'text' ? 'gift' : ''
  };
}

/**
 * @param {unknown} streamKey
 * @param {readonly any[] | null | undefined} items
 * @param {number} nowMs
 * @returns {{ liveId: string, rows: any[], at: number } | null}
 */
export function serviceItemsToLiveTail(streamKey, items, nowMs) {
  const key = String(streamKey || '').trim();
  if (!key) return null;
  const rows = [];
  for (const item of items || []) {
    const row = serviceItemToMirrorRow(item, nowMs);
    if (row) rows.push(row);
  }
  return buildLiveEventsTail({ liveId: computePseudoLvForVideoId(key), rows }, nowMs);
}
