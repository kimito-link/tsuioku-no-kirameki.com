/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】YouTube チャンネル単位のライブコメント投稿者索引の更新・照合（本文は持たない）
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし（呼び出し側が yt_channel_commenters_v1 に書く）
 * 【正本宣言】動画コメントと配信コメントの交差に使う索引の形は channelCommenterIndex.js。ここはその YouTube 向けの口
 */

import { isYtChannelId } from './ytVideoWatchMeta.js';
import { isIndexedPersonId } from '../viewerBehaviorMatch.js';
import {
  CHANNEL_COMMENTER_INDEX_CAP,
  applyCommentsToChannelIndex,
  peopleInChannelCommenterIndex as peopleInIndex,
} from '../channelCommenterIndex.js';

/** 1チャンネルあたり覚える投稿者の上限（古い順に落とす）。低スペックの storage を守る */
export const YT_CHANNEL_COMMENTER_INDEX_CAP = CHANNEL_COMMENTER_INDEX_CAP;

/**
 * ライブで保存したコメント行を、チャンネルの索引へ足した新しい索引を返す（元のオブジェクトは変えない）。
 * @param {import('../channelCommenterIndex.js').ChannelCommenterIndex | null | undefined} prev
 * @param {string} broadcasterChannelId
 * @param {readonly any[]} comments
 * @param {number} [nowMs]
 * @param {{ streamId?: string, contentKind?: 'live' | 'video' }} [opts]
 */
export function applyLiveCommentsToChannelIndex(prev, broadcasterChannelId, comments, nowMs = 0, opts = {}) {
  return applyCommentsToChannelIndex(prev, broadcasterChannelId, comments, nowMs, {
    isOwnerId: (id) => isYtChannelId(id) || isIndexedPersonId(id),
    isPersonId: (id) => isYtChannelId(id) || isIndexedPersonId(id),
    idFromRow: (row) => String(row?.channelId || row?.ytChannelId || '').trim(),
    cap: YT_CHANNEL_COMMENTER_INDEX_CAP,
    streamId: opts.streamId,
    contentKind: opts.contentKind,
  });
}

/**
 * @param {import('../channelCommenterIndex.js').ChannelCommenterIndex | null | undefined} index
 * @param {string} broadcasterChannelId
 */
export function peopleInChannelCommenterIndex(index, broadcasterChannelId) {
  return peopleInIndex(index, broadcasterChannelId);
}
