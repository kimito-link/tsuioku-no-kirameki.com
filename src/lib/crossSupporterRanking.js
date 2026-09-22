/**
 * 過去 N 配信を横断した「応援者ランキング」を作る純関数(段B・2026-09-22)。
 *
 * 設計(上位計画 elegant-crunching-quokka.md 段B・実コード裏取り済み):
 *   `indexPastUsers`(commenterHistoricalAnalytics.js)で過去配信を userId 単位に横断集計し、
 *   `buildSupporterRanking`(supporterRanking.js)が期待する topUsers 形へ変換して呼び出す。
 *   その戻り値(SupporterRow[])に broadcastCount(何配信を横断したか)を外側で合成する。
 *
 * ★不変条件: `buildSupporterRanking`/`SupporterRow` 型は無改変(既存の
 *   status-entry.js#buildSupporterExpander が popup-entry.js の自律tick経由で実運用中の
 *   単一配信専用コードのため、型を拡張すると波及しうる。ここでは外側で合成するに留める)。
 * ★呼び出し側の契約: `pastBroadcasts` は既に配信者除外済みのものを渡すこと
 *   (marketingChartsHtml.js の pastBroadcastsForLayer を想定・配信者除外の二重実装をしない)。
 *   `currentLiveId` と同じ liveId の除外は `indexPastUsers` が内部で行う。
 *
 * fs / child_process / chrome.* に触らない(src/lib の掟)。
 *
 * @module crossSupporterRanking
 */
import { indexPastUsers } from './commenterHistoricalAnalytics.js';
import { buildSupporterRanking } from './supporterRanking.js';

/**
 * @typedef {import('./supporterRanking.js').SupporterRow} SupporterRow
 * @typedef {SupporterRow & { broadcastCount: number }} CrossSupporterRow
 */

/**
 * @param {import('./commenterHistoricalAnalytics.js').BroadcastBundle[]} pastBroadcasts
 * @param {string} currentLiveId
 * @param {{ limit?: number }} [opts]
 * @returns {CrossSupporterRow[]}
 */
export function buildCrossSupporterRanking(pastBroadcasts, currentLiveId, opts = {}) {
  const map = indexPastUsers(pastBroadcasts, currentLiveId);
  const topUsers = Array.from(map.values())
    // ★buildSupporterRanking は「topUsers が既に件数降順」を前提に limit 件で早期break する
    //   実装(supporterRanking.js:63 のコメント参照)。Map から取り出しただけでは順序不定なので、
    //   ここで明示的に降順ソートしてから渡す(この前提を満たさないと上位N件の選出を誤る)。
    .sort((a, b) => b.totalComments - a.totalComments)
    .map((row) => ({
      userId: row.userId,
      nickname: row.nickname,
      avatarUrl: '',
      count: row.totalComments
    }));
  const rows = buildSupporterRanking(topUsers, opts);
  const broadcastCountByUserId = new Map(
    Array.from(map.values()).map((row) => [row.userId, row.broadcastIds.size])
  );
  return rows.map((row) => ({
    ...row,
    broadcastCount: row.userId ? broadcastCountByUserId.get(row.userId) || 0 : 0
  }));
}
