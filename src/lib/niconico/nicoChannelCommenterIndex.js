/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ニコニコの投稿者（数値ユーザー ID）単位の索引（本文は持たない）
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし（呼び出し側が nls_nico_channel_commenters_v1 に書く）
 * 【正本宣言】ニコ動とニコ生の交差に使う索引は channelCommenterIndex.js。ここはそのニコニコ向けの口
 */

import { isNicoNumericUserId } from './nicoVideoWatchMeta.js';
import {
  CHANNEL_COMMENTER_INDEX_CAP,
  applyCommentsToChannelIndex,
  peopleInChannelCommenterIndex as peopleInIndex,
} from '../channelCommenterIndex.js';

export const NICO_CHANNEL_COMMENTER_INDEX_CAP = CHANNEL_COMMENTER_INDEX_CAP;

/**
 * @param {import('../channelCommenterIndex.js').ChannelCommenterIndex | null | undefined} prev
 * @param {string} ownerId
 * @param {readonly any[]} comments
 * @param {number} [nowMs]
 * @param {{ streamId?: string, contentKind?: 'live' | 'video' }} [opts]
 */
export function applyNicoCommentsToChannelIndex(prev, ownerId, comments, nowMs = 0, opts = {}) {
  return applyCommentsToChannelIndex(prev, ownerId, comments, nowMs, {
    isOwnerId: isNicoNumericUserId,
    isPersonId: isNicoNumericUserId,
    idFromRow: (row) => String(row?.userId || '').trim(),
    cap: NICO_CHANNEL_COMMENTER_INDEX_CAP,
    streamId: opts.streamId,
    contentKind: opts.contentKind,
  });
}

/**
 * @param {import('../channelCommenterIndex.js').ChannelCommenterIndex | null | undefined} index
 * @param {string} ownerId
 */
export function peopleInNicoChannelCommenterIndex(index, ownerId) {
  return peopleInIndex(index, ownerId);
}
