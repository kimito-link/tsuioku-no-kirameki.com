/**
 * 開発監視トレンド: sessionStorage（セッション）+ chrome.storage.local（永続・最大7日）
 */

import { devMonitorTrendStorageKey } from './storageKeys.js';
import { readStorageBagWithRetry } from './userCommentProfileCache.js';

const STORAGE_PREFIX = 'nl-dev-monitor-trend:';
const MAX_SESSION_POINTS = 24;
const MAX_PERSISTED_POINTS = 250;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** ポップアップ再描画のたびに永続化すると storage.onChanged → refresh のループになるため間引く */
const TREND_CHROME_PERSIST_MIN_MS = 30_000;
/** session 用も毎フレーム追記しない（同一セッション内の見た目用） */
const TREND_SESSION_APPEND_MIN_MS = 12_000;

/** @type {Map<string, number>} liveId -> last persist/append ms */
const _lastChromeTrendPersistMs = new Map();
const _lastSessionTrendAppendMs = new Map();

const DEV_MONITOR_TREND_LOG_PREFIX = '[devMonitorTrendSession]';

/**
 * key ごとの最小間隔 throttling 判定。
 * @param {Map<string, number>} bucket
 * @param {string} key
 * @param {number} minIntervalMs
 * @param {number} nowMs
 * @returns {boolean}
 */
function shouldPassThrottle(bucket, key, minIntervalMs, nowMs) {
  const last = bucket.get(key) || 0;
  return nowMs - last >= minIntervalMs;
}

/**
 * key ごとの最終実行時刻を更新。
 * @param {Map<string, number>} bucket
 * @param {string} key
 * @param {number} nowMs
 */
function touchThrottle(bucket, key, nowMs) {
  bucket.set(key, nowMs);
}

/** 単体テスト用 */
export function resetDevMonitorTrendThrottleForTest() {
  _lastChromeTrendPersistMs.clear();
  _lastSessionTrendAppendMs.clear();
}

/**
 * @typedef {{
 *   t: number,
 *   thumb: number,
 *   idPct: number,
 *   nick: number,
 *   comment: number|null,
 *   displayCount?: number,
 *   storageCount?: number
 * }} DevMonitorTrendPoint
 */

/**
 * 時刻以外が同一なら追記不要（間引き後も同じ値が連続で積まれるのを防ぐ）
 * @param {DevMonitorTrendPoint|undefined|null} a
 * @param {DevMonitorTrendPoint|undefined|null} b
 * @returns {boolean}
 */
function trendMetricsEqual(a, b) {
  if (!a || !b) return false;
  if (
    a.thumb !== b.thumb ||
    a.idPct !== b.idPct ||
    a.nick !== b.nick ||
    a.comment !== b.comment
  ) {
    return false;
  }
  if (a.displayCount !== b.displayCount) return false;
  if (a.storageCount !== b.storageCount) return false;
  return true;
}

/**
 * @param {DevMonitorTrendPoint[]} points
 * @returns {DevMonitorTrendPoint|null}
 */
function latestTrendPointByTime(points) {
  if (!Array.isArray(points) || !points.length) return null;
  /** @type {DevMonitorTrendPoint|null} */
  let best = null;
  for (const p of points) {
    if (!p || typeof p.t !== 'number' || !Number.isFinite(p.t)) continue;
    if (!best || p.t >= best.t) best = p;
  }
  return best;
}

/**
 * @param {string} liveId
 * @returns {string}
 */
function sessionKeyFor(liveId) {
  return `${STORAGE_PREFIX}${String(liveId || '').trim() || '_'}`;
}

/**
 * @param {unknown} raw
 * @returns {DevMonitorTrendPoint[]}
 */
export function parseTrendJsonArray(raw) {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * @param {DevMonitorTrendPoint[]} points
 * @param {number} maxPoints
 * @param {number} maxAgeMs
 * @param {number} nowMs
 * @returns {DevMonitorTrendPoint[]}
 */
export function trimTrendByAgeAndCap(points, maxPoints, maxAgeMs, nowMs) {
  const cutoff = nowMs - maxAgeMs;
  const fresh = points.filter(
    (pt) =>
      pt &&
      typeof pt.t === 'number' &&
      Number.isFinite(pt.t) &&
      pt.t >= cutoff
  );
  fresh.sort((a, b) => a.t - b.t);
  /** @type {Map<number, DevMonitorTrendPoint>} */
  const byT = new Map();
  for (const pt of fresh) {
    byT.set(pt.t, pt);
  }
  const deduped = Array.from(byT.values()).sort((a, b) => a.t - b.t);
  return deduped.slice(-maxPoints);
}

/**
 * @param {DevMonitorTrendPoint[]} a
 * @param {DevMonitorTrendPoint[]} b
 * @returns {DevMonitorTrendPoint[]}
 */
export function mergeTrendArrays(a, b) {
  return trimTrendByAgeAndCap(
    [...a, ...b],
    MAX_PERSISTED_POINTS,
    MAX_AGE_MS,
    Date.now()
  );
}

/**
 * @param {typeof globalThis} win
 * @param {string} liveId
 * @returns {DevMonitorTrendPoint[]}
 */
export function readTrendSeries(win, liveId) {
  try {
    const raw = win.sessionStorage.getItem(sessionKeyFor(liveId));
    return parseTrendJsonArray(raw);
  } catch (err) {
    console.warn(
      `${DEV_MONITOR_TREND_LOG_PREFIX} readTrendSeries: sessionStorage read failed`,
      err
    );
    return [];
  }
}

/**
 * @param {typeof globalThis} win
 * @param {string} liveId
 * @param {{
 *   thumb: number,
 *   idPct: number,
 *   nick: number,
 *   commentPct: number|null,
 *   displayCount?: number,
 *   storageCount?: number
 * }} sample
 */
export function appendTrendPoint(win, liveId, sample) {
  const lid = String(liveId || '').trim();
  if (!lid) return;
  const now0 = Date.now();
  if (!shouldPassThrottle(_lastSessionTrendAppendMs, lid, TREND_SESSION_APPEND_MIN_MS, now0)) {
    return;
  }

  const prev = readTrendSeries(win, lid);
  /** @type {number|null} */
  const comm =
    sample.commentPct != null && Number.isFinite(sample.commentPct)
      ? Math.max(0, Math.min(100, sample.commentPct))
      : null;
  const now = now0;
  /** @type {DevMonitorTrendPoint} */
  const pt = {
    t: now,
    thumb: Math.max(0, Math.min(100, sample.thumb)),
    idPct: Math.max(0, Math.min(100, sample.idPct)),
    nick: Math.max(0, Math.min(100, sample.nick)),
    comment: comm
  };
  if (typeof sample.displayCount === 'number' && Number.isFinite(sample.displayCount)) {
    pt.displayCount = Math.max(0, Math.floor(sample.displayCount));
  }
  if (typeof sample.storageCount === 'number' && Number.isFinite(sample.storageCount)) {
    pt.storageCount = Math.max(0, Math.floor(sample.storageCount));
  }
  const lastSess = latestTrendPointByTime(prev);
  if (lastSess && trendMetricsEqual(lastSess, pt)) {
    touchThrottle(_lastSessionTrendAppendMs, lid, now);
    return;
  }

  const next = trimTrendByAgeAndCap(
    [...prev, pt],
    MAX_SESSION_POINTS,
    MAX_AGE_MS,
    now
  );
  try {
    win.sessionStorage.setItem(sessionKeyFor(lid), JSON.stringify(next));
    touchThrottle(_lastSessionTrendAppendMs, lid, now);
  } catch (err) {
    console.debug(
      `${DEV_MONITOR_TREND_LOG_PREFIX} appendTrendPoint: sessionStorage write skipped (quota/private mode)`,
      err
    );
  }
}

/**
 * @param {Storage} chromeObj
 * @param {string} key
 * @returns {Promise<Record<string, unknown>>}
 */
async function readChromeStorageBag(chromeObj, key) {
  return readStorageBagWithRetry(
    async () =>
      await new Promise((resolve, reject) => {
        try {
          chromeObj.get(key, (r) => {
            if (r && typeof r === 'object' && !Array.isArray(r)) {
              resolve(r);
              return;
            }
            resolve({});
          });
        } catch (err) {
          reject(err);
        }
      }),
    { attempts: 4, delaysMs: [0, 50, 120, 280] }
  );
}

/**
 * chrome.storage.local に追記（ポップアップから void で呼ぶ）
 * @param {string} liveId
 * @param {{
 *   thumb: number,
 *   idPct: number,
 *   nick: number,
 *   commentPct: number|null,
 *   displayCount?: number,
 *   storageCount?: number
 * }} sample
 * @returns {Promise<void>}
 */
export async function persistTrendPointChrome(liveId, sample) {
  const lid = String(liveId || '').trim();
  if (!lid) return;
  const nowWall = Date.now();
  if (!shouldPassThrottle(_lastChromeTrendPersistMs, lid, TREND_CHROME_PERSIST_MIN_MS, nowWall)) {
    return;
  }

  const key = devMonitorTrendStorageKey(lid);
  const chromeObj =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
      ? chrome.storage.local
      : null;
  if (!chromeObj) return;

  /** @type {number|null} */
  const comm =
    sample.commentPct != null && Number.isFinite(sample.commentPct)
      ? Math.max(0, Math.min(100, sample.commentPct))
      : null;
  const now = Date.now();
  /** @type {DevMonitorTrendPoint} */
  const pt = {
    t: now,
    thumb: Math.max(0, Math.min(100, sample.thumb)),
    idPct: Math.max(0, Math.min(100, sample.idPct)),
    nick: Math.max(0, Math.min(100, sample.nick)),
    comment: comm
  };
  if (typeof sample.displayCount === 'number' && Number.isFinite(sample.displayCount)) {
    pt.displayCount = Math.max(0, Math.floor(sample.displayCount));
  }
  if (typeof sample.storageCount === 'number' && Number.isFinite(sample.storageCount)) {
    pt.storageCount = Math.max(0, Math.floor(sample.storageCount));
  }

  const bag = await readChromeStorageBag(chromeObj, key);
  const prev = parseTrendJsonArray(bag[key]);
  const lastPersisted = latestTrendPointByTime(prev);
  if (lastPersisted && trendMetricsEqual(lastPersisted, pt)) {
    touchThrottle(_lastChromeTrendPersistMs, lid, Date.now());
    return;
  }

  const merged = trimTrendByAgeAndCap(
    [...prev, pt],
    MAX_PERSISTED_POINTS,
    MAX_AGE_MS,
    now
  );
  await new Promise((resolve) => {
    try {
      chromeObj.set({ [key]: JSON.stringify(merged) }, () => resolve(undefined));
    } catch (err) {
      console.warn(
        `${DEV_MONITOR_TREND_LOG_PREFIX} persistTrendPointChrome: chrome.storage.local.set failed`,
        err
      );
      resolve(undefined);
    }
  });
  touchThrottle(_lastChromeTrendPersistMs, lid, Date.now());
}

/**
 * @param {typeof globalThis} win
 * @param {string} liveId
 * @returns {Promise<DevMonitorTrendPoint[]>}
 */
export async function readMergedTrendSeries(win, liveId) {
  const lid = String(liveId || '').trim();
  if (!lid) return [];
  const sess = readTrendSeries(win, lid);
  const chromeObj =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
      ? chrome.storage.local
      : null;
  if (!chromeObj) return mergeTrendArrays(sess, []);

  const key = devMonitorTrendStorageKey(lid);
  const bag = await readChromeStorageBag(chromeObj, key);
  const persisted = parseTrendJsonArray(bag[key]);
  return mergeTrendArrays(sess, persisted);
}

/**
 * @param {DevMonitorTrendPoint[]} points
 * @returns {{
 *   thumbSeries: number[],
 *   idSeries: number[],
 *   nickSeries: number[],
 *   commentSeries: (number|null)[],
 *   displaySeries: number[],
 *   storageSeries: number[]
 * }}
 */
export function trendToSparklineArrays(points) {
  return {
    thumbSeries: points.map((p) => p.thumb),
    idSeries: points.map((p) => p.idPct),
    nickSeries: points.map((p) => p.nick),
    commentSeries: points.map((p) =>
      p.comment != null && Number.isFinite(p.comment) ? p.comment : null
    ),
    displaySeries: points.map((p) =>
      typeof p.displayCount === 'number' ? p.displayCount : 0
    ),
    storageSeries: points.map((p) =>
      typeof p.storageCount === 'number' ? p.storageCount : 0
    )
  };
}

/**
 * @param {DevMonitorTrendPoint[]} points
 * @returns {boolean}
 */
export function trendHasCountSamples(points) {
  return points.some(
    (p) =>
      (typeof p.displayCount === 'number' && p.displayCount >= 0) ||
      (typeof p.storageCount === 'number' && p.storageCount >= 0)
  );
}
