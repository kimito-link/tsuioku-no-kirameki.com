/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】チャンネル単位のライブコメント投稿者索引の更新・照合（本文は持たない）
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし（呼び出し側が yt_channel_commenters_v1 に書く）
 * 【正本宣言】動画コメントと配信コメントの交差に使う索引の形はこのファイル
 */

import { isYtChannelId } from './ytVideoWatchMeta.js';

/** 1チャンネルあたり覚える投稿者の上限（古い順に落とす）。低スペックの storage を守る */
export const YT_CHANNEL_COMMENTER_INDEX_CAP = 5000;

/**
 * @typedef {{ n: string, c: number, t: number }} YtChannelCommenterEntry
 * @typedef {{ updatedAt: number, streamCount?: number, people: Record<string, YtChannelCommenterEntry> }} YtChannelCommenterBucket
 * @typedef {Record<string, YtChannelCommenterBucket>} YtChannelCommenterIndex
 */

/**
 * ライブで保存したコメント行を、チャンネルの索引へ足した新しい索引を返す（元のオブジェクトは変えない）。
 * @param {YtChannelCommenterIndex | null | undefined} prev
 * @param {string} broadcasterChannelId
 * @param {readonly any[]} comments
 * @param {number} [nowMs]
 * @returns {YtChannelCommenterIndex}
 */
export function applyLiveCommentsToChannelIndex(prev, broadcasterChannelId, comments, nowMs = 0) {
  const ch = String(broadcasterChannelId || '').trim();
  const index = prev && typeof prev === 'object' ? { ...prev } : {};
  if (!isYtChannelId(ch)) return index;
  const list = Array.isArray(comments) ? comments : [];
  const prevBucket = index[ch] && typeof index[ch] === 'object' ? index[ch] : { updatedAt: 0, people: {} };
  /** @type {Record<string, YtChannelCommenterEntry>} */
  const people = { ...(prevBucket.people && typeof prevBucket.people === 'object' ? prevBucket.people : {}) };
  let changed = false;
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.channelId || row.ytChannelId || '').trim();
    if (!isYtChannelId(id) || id === ch) continue;
    const name = String(row.name || row.nickname || row.authorName || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const at = Number(row.postedAtMs || row.recordedAt || nowMs || 0) || 0;
    const cur = people[id];
    if (!cur) {
      people[id] = { n: name, c: 1, t: at };
      changed = true;
    } else {
      const next = {
        n: name || cur.n,
        c: (Number(cur.c) || 0) + 1,
        t: at > (Number(cur.t) || 0) ? at : Number(cur.t) || 0,
      };
      if (next.n !== cur.n || next.c !== cur.c || next.t !== cur.t) {
        people[id] = next;
        changed = true;
      }
    }
  }
  if (!changed) {
    index[ch] = prevBucket;
    return index;
  }
  const ids = Object.keys(people);
  if (ids.length > YT_CHANNEL_COMMENTER_INDEX_CAP) {
    ids.sort((a, b) => (Number(people[a].t) || 0) - (Number(people[b].t) || 0));
    const drop = ids.length - YT_CHANNEL_COMMENTER_INDEX_CAP;
    for (let i = 0; i < drop; i += 1) delete people[ids[i]];
  }
  index[ch] = {
    updatedAt: Number(nowMs) || Number(prevBucket.updatedAt) || 0,
    streamCount: Number(prevBucket.streamCount) || 0,
    people,
  };
  return index;
}

/**
 * @param {YtChannelCommenterIndex | null | undefined} index
 * @param {string} broadcasterChannelId
 * @returns {Record<string, YtChannelCommenterEntry>}
 */
export function peopleInChannelCommenterIndex(index, broadcasterChannelId) {
  const ch = String(broadcasterChannelId || '').trim();
  const bucket = index && typeof index === 'object' ? index[ch] : null;
  if (!bucket || typeof bucket !== 'object' || !bucket.people || typeof bucket.people !== 'object') return {};
  return bucket.people;
}
