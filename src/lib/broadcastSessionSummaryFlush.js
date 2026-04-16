/**
 * サマリ IndexedDB への間欠フラッシュ（ポップアップから呼ぶ）
 */

import {
  appendBroadcastSessionSummarySample,
  openBroadcastSessionSummaryDb
} from './broadcastSessionSummaryDb.js';
import { resolveConcurrentViewers } from './concurrentEstimate.js';
import { shouldShowConcurrentEstimate } from './popupConcurrentEstimateGate.js';
import { summarizeRecordedCommenters } from './liveCommenterStats.js';
import { giftUsersStorageKey } from './storageKeys.js';
import { readStorageBagWithRetry } from './userCommentProfileCache.js';

const FLUSH_MIN_INTERVAL_MS = 60_000;

let lastFlushAt = 0;
const BROADCAST_SESSION_SUMMARY_LOG_PREFIX = '[broadcastSessionSummaryFlush]';

/**
 * IndexedDB 書き込みで起こりうる「一過性・想定内」の DOMException 名。
 * 拡張機能の「エラー」一覧に警告として積み上がるとユーザー視点で不安を煽るので、
 * このセットに該当する場合は debug ログに落として記録サマリ機能だけ次回に見送る。
 * 背景:
 * - InvalidStateError: ポップアップが閉じる等で DB ハンドルが先にクローズされた
 * - AbortError: タブ遷移や別バージョンからの versionchange でトランザクション中断
 * - QuotaExceededError: 端末のストレージ逼迫（本機能は失っても構わない軽量サマリ）
 * - TransactionInactiveError: 非同期タイムアウトでトランザクションが終了
 * - TimeoutError / UnknownError: ブラウザ側の一過性不調
 */
const TRANSIENT_IDB_ERROR_NAMES = new Set([
  'InvalidStateError',
  'AbortError',
  'QuotaExceededError',
  'TransactionInactiveError',
  'TimeoutError',
  'UnknownError'
]);

/**
 * DOMException を人間可読な短い説明に整形する（console.warn/debug 用）。
 * @param {unknown} err
 * @returns {string}
 */
export function describeIdbError(err) {
  if (err && typeof err === 'object' && 'name' in err) {
    const e = /** @type {{ name?: string, message?: string }} */ (err);
    const name = String(e.name || 'Error');
    const msg = String(e.message || '').trim();
    return msg ? `${name}: ${msg}` : name;
  }
  return String(err);
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientIdbError(err) {
  if (!err || typeof err !== 'object') return false;
  const name = String(/** @type {{ name?: string }} */ (err).name || '');
  return TRANSIENT_IDB_ERROR_NAMES.has(name);
}

/**
 * @param {Record<string, unknown>|null|undefined} snapshot
 * @returns {number|null}
 */
export function peakConcurrentEstimateFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const vcRaw = snapshot.viewerCountFromDom;
  const vc =
    typeof vcRaw === 'number' && Number.isFinite(vcRaw) && vcRaw >= 0
      ? vcRaw
      : undefined;
  const recentActive =
    typeof snapshot.recentActiveUsers === 'number'
      ? snapshot.recentActiveUsers
      : 0;
  const officialVcRaw = snapshot.officialViewerCount;
  const officialVc =
    typeof officialVcRaw === 'number' && Number.isFinite(officialVcRaw)
      ? officialVcRaw
      : undefined;
  const liveIdStr =
    typeof snapshot.liveId === 'string' ? snapshot.liveId : '';
  const show = shouldShowConcurrentEstimate({
    recentActiveUsers: recentActive,
    officialViewerCount: officialVc,
    viewerCountFromDom: vc,
    liveId: liveIdStr
  });
  if (!show) return null;

  const streamAge =
    typeof snapshot.streamAgeMin === 'number' && snapshot.streamAgeMin >= 0
      ? snapshot.streamAgeMin
      : undefined;
  const resolved = resolveConcurrentViewers({
    nowMs: Date.now(),
    officialViewers:
      typeof snapshot.officialViewerCount === 'number' &&
      Number.isFinite(snapshot.officialViewerCount)
        ? snapshot.officialViewerCount
        : undefined,
    officialUpdatedAtMs:
      typeof snapshot.officialStatsUpdatedAt === 'number' &&
      Number.isFinite(snapshot.officialStatsUpdatedAt)
        ? snapshot.officialStatsUpdatedAt
        : undefined,
    officialViewerIntervalMs:
      typeof snapshot.officialViewerIntervalMs === 'number' &&
      Number.isFinite(snapshot.officialViewerIntervalMs) &&
      snapshot.officialViewerIntervalMs > 0
        ? snapshot.officialViewerIntervalMs
        : undefined,
    previousStatisticsComments:
      typeof snapshot.officialCommentCount === 'number' &&
      Number.isFinite(snapshot.officialCommentCount) &&
      typeof snapshot.officialStatisticsCommentsDelta === 'number' &&
      Number.isFinite(snapshot.officialStatisticsCommentsDelta)
        ? Math.max(
            0,
            snapshot.officialCommentCount - snapshot.officialStatisticsCommentsDelta
          )
        : undefined,
    currentStatisticsComments:
      typeof snapshot.officialCommentCount === 'number' &&
      Number.isFinite(snapshot.officialCommentCount)
        ? snapshot.officialCommentCount
        : undefined,
    receivedCommentsDelta:
      typeof snapshot.officialReceivedCommentsDelta === 'number' &&
      Number.isFinite(snapshot.officialReceivedCommentsDelta)
        ? snapshot.officialReceivedCommentsDelta
        : undefined,
    recentActiveUsers: recentActive,
    totalVisitors: vc != null && vc > 0 ? vc : undefined,
    streamAgeMin: streamAge
  });

  const est = resolved?.estimated;
  return typeof est === 'number' && Number.isFinite(est) ? Math.round(est) : null;
}

/**
 * @param {{
 *   liveId: string,
 *   watchUrl: string,
 *   comments: readonly unknown[],
 *   snapshot: Record<string, unknown>|null|undefined,
 *   recording: boolean
 * }} input
 * @returns {Promise<void>}
 */
export async function maybeFlushBroadcastSessionSummarySample(input) {
  if (typeof indexedDB === 'undefined') return;

  const lid = String(input.liveId || '').trim().toLowerCase();
  if (!lid) return;

  const now = Date.now();
  if (now - lastFlushAt < FLUSH_MIN_INTERVAL_MS) return;
  lastFlushAt = now;

  const comments = Array.isArray(input.comments) ? input.comments : [];
  const st = summarizeRecordedCommenters(comments);

  let giftUserCount = 0;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      const key = giftUsersStorageKey(lid);
      const bag = await readStorageBagWithRetry(
        async () => await chrome.storage.local.get(key),
        { attempts: 4, delaysMs: [0, 50, 120, 280] }
      );
      const raw = bag[key];
      giftUserCount = Array.isArray(raw) ? raw.length : 0;
    }
  } catch (err) {
    console.warn(
      `${BROADCAST_SESSION_SUMMARY_LOG_PREFIX} failed to read gift users from storage`,
      err
    );
    giftUserCount = 0;
  }

  const snap = input.snapshot;
  const oc =
    snap && typeof snap.officialCommentCount === 'number'
      ? snap.officialCommentCount
      : null;
  const ov =
    snap && typeof snap.officialViewerCount === 'number'
      ? snap.officialViewerCount
      : null;

  let officialCaptureRatio = null;
  if (snap && snap.officialCaptureRatio != null) {
    const r = Number(snap.officialCaptureRatio);
    if (Number.isFinite(r)) officialCaptureRatio = r;
  }

  const row = {
    liveId: lid,
    capturedAt: now,
    watchUrl: String(input.watchUrl || '').trim(),
    recording: Boolean(input.recording),
    commentStorageCount: comments.length,
    uniqueKnownCommenters: st.uniqueKnownUserIds,
    giftUserCount,
    peakConcurrentEstimate: peakConcurrentEstimateFromSnapshot(snap),
    officialCommentCount: oc,
    officialViewerCount: ov,
    officialCaptureRatio
  };

  let db;
  try {
    db = await openBroadcastSessionSummaryDb();
    await appendBroadcastSessionSummarySample(db, row);
  } catch (err) {
    // 拡張機能の「エラー」一覧を汚さないため、想定内の一過性 DOMException は debug に降格。
    // 本機能（放送セッション軽量サマリ）は落としても他の記録機能に影響しないので、
    // 黙って次の 60 秒後のフラッシュで再試行させる。
    const detail = describeIdbError(err);
    if (isTransientIdbError(err)) {
      console.debug(
        `${BROADCAST_SESSION_SUMMARY_LOG_PREFIX} transient IndexedDB error, skipping sample: ${detail}`
      );
    } else {
      console.warn(
        `${BROADCAST_SESSION_SUMMARY_LOG_PREFIX} failed to append summary sample: ${detail}`,
        err
      );
    }
  } finally {
    try {
      db?.close();
    } catch (err) {
      console.debug(
        `${BROADCAST_SESSION_SUMMARY_LOG_PREFIX} failed to close IndexedDB handle`,
        err
      );
    }
  }
}
