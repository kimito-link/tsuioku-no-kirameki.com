// ytViewerSampler.js — YouTube の同時視聴者数を、パネルを閉じていても1分ごとに記録する(2026-11-05 りんく
//   「同接が2万近くいたのにマーケ HTML にその記録がない」)。
//   ニコ生版の同接の記録(broadcastSessionSummaryFlush)はパネルが開いている間しか書かないので、会場モードで見ていると
//   20分ぶん抜けた(実例: 27分で9点・5分→25分が空)。YouTube はタブが5秒ごとに「N人が視聴中」を送ってくるので、
//   それを background で受けて、マーケの「同接推移カーブ」が読む同じ表(broadcast summary の IndexedDB)に足す。
import {
  BROADCAST_SUMMARY_DB_NAME,
  appendBroadcastSessionSummarySample,
  listBroadcastSessionSummaryForLive,
  openBroadcastSessionSummaryDb,
} from '../broadcastSessionSummaryDb.js';
import { computePseudoLvForVideoId } from './ytPseudoLv.js';

export const YT_VIEWER_SAMPLE_INTERVAL_MS = 60_000;

/**
 * 記録するか(配信ごとに1分に1回・数として妥当なときだけ)。
 * @param {Map<string, number>} lastAt
 * @param {string} videoId
 * @param {unknown} viewers
 * @param {number} now
 */
export function shouldSampleYtViewers(lastAt, videoId, viewers, now) {
  if (!videoId || typeof viewers !== 'number' || !Number.isFinite(viewers) || viewers <= 0 || viewers > 1e8) return false;
  const prev = lastAt.get(videoId) || 0;
  return now - prev >= YT_VIEWER_SAMPLE_INTERVAL_MS - 2000; // タブの5秒刻みのずれを許す
}

/**
 * 1行を作る。パネルが書いた直近の行(題名・配信者・応援者数など)があれば写して、時刻と同接だけ今のものにする
 *   (マーケ・メディアキットは配信の最後の行から題名や応援者数を読むので、空の行を最後にしない)。
 * @param {string} videoId
 * @param {number} viewers
 * @param {number} now
 * @param {{ itemCount?: number, title?: string, broadcasterName?: string, broadcasterIconUrl?: string }} [summary]
 * @param {Record<string, any> | null} [base] パネルが書いた直近の行
 * @returns {Omit<import('../broadcastSessionSummaryDb.js').BroadcastSessionSummaryRow, 'id'> & Record<string, any>}
 */
export function ytViewerSampleRow(videoId, viewers, now, summary, base) {
  const v = Math.floor(viewers);
  const items = Number(summary?.itemCount) || 0;
  /** @type {Record<string, any>} */
  const from = base && typeof base === 'object' ? { ...base } : {};
  delete from.id;
  return {
    uniqueKnownCommenters: 0,
    giftUserCount: 0,
    officialCommentCount: null,
    officialCaptureRatio: null,
    ...(summary?.title ? { broadcastTitle: String(summary.title) } : {}),
    ...(summary?.broadcasterName ? { broadcasterName: String(summary.broadcasterName) } : {}),
    ...(summary?.broadcasterIconUrl ? { broadcasterIconUrl: String(summary.broadcasterIconUrl) } : {}),
    ...from,
    liveId: computePseudoLvForVideoId(videoId),
    capturedAt: now,
    watchUrl: String(from.watchUrl || `https://www.youtube.com/watch?v=${videoId}`),
    recording: true,
    commentStorageCount: Math.max(items, Number(from.commentStorageCount) || 0),
    // 画面(ytNicoShim)は YouTube の「N人が視聴中」を officialViewerCount に入れている。同じ欄に同じ意味で入れる
    officialViewerCount: v,
    peakConcurrentEstimate: v,
    source: 'yt-background',
  };
}

/**
 * @param {{ merged: boolean }} o merged=本体に同梱(YouTube 版の DB は ytm: 付き・ytMergedIsolation.js と同じ)
 */
export function createYtViewerSampler({ merged }) {
  /** @type {Map<string, number>} */
  const lastAt = new Map();
  const dbName = merged ? `ytm:${BROADCAST_SUMMARY_DB_NAME}` : BROADCAST_SUMMARY_DB_NAME;
  return {
    /**
     * @param {string} videoId
     * @param {unknown} viewers
     * @param {{ itemCount?: number, title?: string, broadcasterName?: string, broadcasterIconUrl?: string }} [summary]
     */
    async maybeSample(videoId, viewers, summary) {
      const now = Date.now();
      if (!shouldSampleYtViewers(lastAt, videoId, viewers, now)) return false;
      lastAt.set(videoId, now);
      let db;
      try {
        db = await openBroadcastSessionSummaryDb(dbName);
        const recent = await listBroadcastSessionSummaryForLive(db, computePseudoLvForVideoId(videoId), 5).catch(() => /** @type {any[]} */ ([]));
        const base = recent.find((r) => r && /** @type {any} */ (r).source !== 'yt-background') || recent[0] || null;
        await appendBroadcastSessionSummarySample(db, ytViewerSampleRow(videoId, /** @type {number} */ (viewers), now, summary, base));
        return true;
      } catch {
        return false; // 次の1分で試し直す(記録の本体は止めない)
      } finally {
        try {
          db?.close();
        } catch {
          /* no-op */
        }
      }
    },
  };
}
