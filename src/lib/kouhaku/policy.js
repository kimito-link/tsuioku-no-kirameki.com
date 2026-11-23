/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】公式ページへ GET してよいかの判断
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / スリープ
 * 【書けるstorageキー】なし
 * 【正本宣言】1日最大2回(16:30、失敗時はバックオフ後の19:30)はこのファイルのみ
 *
 * policy.js — 関数の中では待たない。待たずに「まだ早い」と返す。
 */

import {
  BACKOFF_BASE_MS,
  BACKOFF_GRACE_MS,
  EVENT_FETCH_START,
  EVENT_FETCH_UNTIL,
  MAX_FETCHES_PER_JST_DAY,
  PRIMARY_FETCH_MINUTE
} from './constants.js';
import { jstDateString, jstMinutesOfDay } from './time.js';

/**
 * @typedef {import('./model.js').FetchState} FetchState
 * @typedef {'event-not-started'|'event-closed'|'too-early'|'already-succeeded'|'daily-cap'|'backoff'} SkipReason
 * @typedef {{ action: 'fetch' } | { action: 'skip', reason: SkipReason }} FetchDecision
 */

/**
 * 日付が変わっていたら、その日の試行回数だけを戻す。ETag と最新スナップショットは残す。
 * @param {FetchState} state
 * @param {Date} now
 * @returns {FetchState}
 */
export function viewState(state, now) {
  const today = jstDateString(now);
  if (state.jstDate === today) return state;
  return { ...state, jstDate: today, attempts: 0, lastError: null };
}

/**
 * 失敗 n 回のあとの待ち。初項 1時間、n=1 で 2時間。
 * 同日の再試行は1回までなので、実際に使うのは n=1 だけ。
 * @param {number} failedAttempts
 * @returns {number}
 */
export function backoffDelayMs(failedAttempts) {
  const exponent = Math.min(Math.max(failedAttempts, 1), 4);
  return BACKOFF_BASE_MS * 2 ** exponent;
}

/**
 * @param {FetchState} state
 * @param {Date} now
 * @param {{ fetchStart?: string, fetchUntil?: string }|null} [event]
 * @returns {FetchDecision}
 */
export function decideFetch(state, now, event) {
  const today = jstDateString(now);
  const fetchStart = event && event.fetchStart ? event.fetchStart : EVENT_FETCH_START;
  const fetchUntil = event && event.fetchUntil ? event.fetchUntil : EVENT_FETCH_UNTIL;
  if (today < fetchStart) return { action: 'skip', reason: 'event-not-started' };
  if (today > fetchUntil) return { action: 'skip', reason: 'event-closed' };

  const current = viewState(state, now);
  const succeededToday = current.lastSuccessAt !== null && jstDateString(new Date(current.lastSuccessAt)) === today;
  if (succeededToday) return { action: 'skip', reason: 'already-succeeded' };
  if (current.attempts >= MAX_FETCHES_PER_JST_DAY) return { action: 'skip', reason: 'daily-cap' };

  if (current.attempts === 0) {
    if (jstMinutesOfDay(now) < PRIMARY_FETCH_MINUTE) return { action: 'skip', reason: 'too-early' };
    return { action: 'fetch' };
  }

  if (!current.lastAttemptAt) return { action: 'skip', reason: 'backoff' };
  const eligibleAt = new Date(current.lastAttemptAt).getTime() + backoffDelayMs(current.attempts);
  if (now.getTime() + BACKOFF_GRACE_MS < eligibleAt) return { action: 'skip', reason: 'backoff' };
  return { action: 'fetch' };
}
