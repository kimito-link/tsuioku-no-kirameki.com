/**
 * コメンター（数値 userId）のフォロー先 userId リスト横断キャッシュ。
 * chrome 依存なし。content / popup / 分析 HTML から利用。
 */

/** 再取得を抑止する鮮度（24h） */
export const COMMENTER_FOLLOWING_LIST_TTL_MS = 24 * 60 * 60 * 1000;
/** 1 コメンターあたり保存する followee id 上限 */
export const COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED = 200;
/** 配信ごとにフォロー一覧を取るコメンター上限（配信3 + レポート7） */
export const COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE = 10;
/** 配信中のみ取得する上限 */
export const COMMENTER_FOLLOWING_LIST_LIVE_MAX = 3;

/**
 * @typedef {'ok'|'forbidden'|'error'|'login_required'} CommenterFollowingListStatus
 */

/**
 * @typedef {{
 *   userIds: string[],
 *   totalCount?: number,
 *   fetchedAt: number,
 *   status: CommenterFollowingListStatus,
 *   truncated: boolean,
 *   pageCount: number
 * }} CommenterFollowingListEntry
 */

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function posIntOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * @param {unknown} v
 * @returns {CommenterFollowingListStatus}
 */
function statusOrError(v) {
  const s = String(v || '').trim();
  if (s === 'ok' || s === 'forbidden' || s === 'error' || s === 'login_required') return s;
  return 'error';
}

/**
 * @param {number} fetchedAt
 * @param {number} nowMs
 * @param {number} ttlMs
 * @returns {boolean}
 */
export function isFreshFollowingListEntry(fetchedAt, nowMs, ttlMs) {
  const at = Number(fetchedAt);
  if (!Number.isFinite(at) || at <= 0) return false;
  const now = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const ttl =
    Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : COMMENTER_FOLLOWING_LIST_TTL_MS;
  return at >= now - ttl;
}

/**
 * TTL 内のエントリは再 fetch 不要か（login_required / forbidden もキャッシュして再試行抑制）。
 * @param {CommenterFollowingListEntry|undefined|null} entry
 * @param {number} [nowMs]
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
export function shouldSkipFollowingListFetch(entry, nowMs, ttlMs) {
  if (!entry || !Number.isFinite(Number(entry.fetchedAt))) return false;
  return isFreshFollowingListEntry(Number(entry.fetchedAt), nowMs, ttlMs);
}

/**
 * @param {unknown} raw
 * @param {number} [fetchedAtFallback]
 * @returns {CommenterFollowingListEntry|null}
 */
export function normalizeCommenterFollowingListEntry(raw, fetchedAtFallback) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const fa = Number(o.fetchedAt);
  const fetchedAt =
    Number.isFinite(fa) && fa > 0
      ? fa
      : Number.isFinite(Number(fetchedAtFallback)) && Number(fetchedAtFallback) > 0
        ? Number(fetchedAtFallback)
        : Date.now();
  const status = statusOrError(o.status);
  const srcIds = Array.isArray(o.userIds) ? o.userIds : [];
  /** @type {string[]} */
  const userIds = [];
  const seen = new Set();
  for (const item of srcIds) {
    const uid = String(item || '').trim();
    if (!/^\d{1,18}$/.test(uid) || seen.has(uid)) continue;
    seen.add(uid);
    userIds.push(uid);
    if (userIds.length >= COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED) break;
  }
  const totalCount = posIntOrNull(o.totalCount);
  const pageCount = posIntOrNull(o.pageCount) ?? 0;
  const truncated = o.truncated === true || userIds.length >= COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED;
  if (status !== 'ok' && status !== 'forbidden' && status !== 'login_required' && status !== 'error') {
    return null;
  }
  if (status === 'ok' && !userIds.length && totalCount == null) {
    /** empty ok list is valid */
  }
  /** @type {CommenterFollowingListEntry} */
  const entry = {
    userIds,
    fetchedAt,
    status,
    truncated,
    pageCount
  };
  if (totalCount != null) entry.totalCount = totalCount;
  return entry;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, CommenterFollowingListEntry>}
 */
export function normalizeFollowingListMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, CommenterFollowingListEntry>} */
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    const uid = String(key || '').trim();
    if (!/^\d{1,18}$/.test(uid)) continue;
    const entry = normalizeCommenterFollowingListEntry(value);
    if (entry) out[uid] = entry;
  }
  return out;
}

/**
 * @param {Record<string, CommenterFollowingListEntry>} map
 * @param {string} uid
 * @param {CommenterFollowingListEntry} entry
 * @returns {boolean}
 */
export function upsertFollowingListEntry(map, uid, entry) {
  const id = String(uid || '').trim();
  if (!/^\d{1,18}$/.test(id) || !entry) return false;
  if (!map || typeof map !== 'object') return false;
  map[id] = entry;
  return true;
}

/**
 * コメント数降順 stats から、フォロー一覧を fetch すべき uid を返す。
 * @param {readonly { userId: string, commentCount?: number }[]} stats
 * @param {Record<string, CommenterFollowingListEntry>} cache
 * @param {{ nowMs?: number, ttlMs?: number, limit?: number, maxRank?: number, skipStatuses?: readonly CommenterFollowingListStatus[], forceRetryStatuses?: readonly CommenterFollowingListStatus[] }} [opts]
 * @returns {string[]}
 */
export function pickFollowingListUidsToFetch(stats, cache, opts = {}) {
  const nowMs =
    Number.isFinite(Number(opts.nowMs)) && Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
  const ttlMs =
    Number.isFinite(Number(opts.ttlMs)) && Number(opts.ttlMs) > 0
      ? Number(opts.ttlMs)
      : COMMENTER_FOLLOWING_LIST_TTL_MS;
  const limit =
    Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0
      ? Math.floor(Number(opts.limit))
      : 1;
  const maxRank =
    Number.isFinite(Number(opts.maxRank)) && Number(opts.maxRank) > 0
      ? Math.floor(Number(opts.maxRank))
      : COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE;
  const skipStatuses = opts.skipStatuses || ['forbidden'];
  const safeCache = cache && typeof cache === 'object' ? cache : {};
  /** @type {string[]} */
  const out = [];
  const ranked = Array.isArray(stats) ? stats.slice(0, maxRank) : [];
  for (const row of ranked) {
    const uid = String(row?.userId || '').trim();
    if (!/^\d{1,18}$/.test(uid)) continue;
    const hit = safeCache[uid];
    const forceRetry = Array.isArray(opts.forceRetryStatuses) ? opts.forceRetryStatuses : [];
    if (hit && forceRetry.includes(hit.status)) {
      out.push(uid);
      if (out.length >= limit) break;
      continue;
    }
    if (hit && shouldSkipFollowingListFetch(hit, nowMs, ttlMs)) continue;
    if (hit && skipStatuses.includes(hit.status)) continue;
    out.push(uid);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * @param {import('./commenterFollowCache.js').CommenterFollowRow[]} rows
 * @param {Record<string, CommenterFollowingListEntry>} listMap
 * @param {string} broadcasterUserId
 * @returns {import('./commenterFollowCache.js').CommenterFollowRow[]}
 */
export function mergeFollowingListIntoRows(rows, listMap, broadcasterUserId) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const map = listMap && typeof listMap === 'object' ? listMap : {};
  const bUid = String(broadcasterUserId || '').trim();
  return rows.map((row) => {
    const hit = map[row.userId];
    if (!hit) return row;
    /** @type {import('./commenterFollowCache.js').CommenterFollowRow} */
    const next = { ...row };
    next.followingListStatus = hit.status;
    next.followingListCount = hit.userIds.length;
    if (bUid && hit.status === 'ok') {
      next.followsBroadcaster = hit.userIds.includes(bUid);
    }
    return next;
  });
}

/**
 * background fetch 応答から storage エントリを組み立てる。
 * @param {unknown} resp
 * @param {number} [nowMs]
 * @returns {CommenterFollowingListEntry|null}
 */
export function buildFollowingListEntryFromFetchResponse(resp, nowMs) {
  const now =
    Number.isFinite(Number(nowMs)) && Number(nowMs) > 0 ? Number(nowMs) : Date.now();
  const r = resp && typeof resp === 'object' ? /** @type {Record<string, unknown>} */ (resp) : null;
  if (!r || r.skipped) return null;
  if (r.ok === true && r.followingStatus === 'ok') {
    return normalizeCommenterFollowingListEntry({
      userIds: Array.isArray(r.userIds) ? r.userIds : [],
      totalCount: r.totalCount,
      status: 'ok',
      truncated: r.truncated === true,
      pageCount: Number(r.pageCount) || 1,
      fetchedAt: now
    });
  }
  const statusRaw = r.followingStatus;
  const status =
    statusRaw === 'login_required' || statusRaw === 'forbidden' || statusRaw === 'error'
      ? statusRaw
      : Number(r.status) === 401
        ? 'login_required'
        : Number(r.status) === 403 || Number(r.status) === 404
          ? 'forbidden'
          : 'error';
  return normalizeCommenterFollowingListEntry({
    userIds: [],
    status,
    truncated: false,
    pageCount: 0,
    fetchedAt: now
  });
}

/**
 * @param {Record<string, CommenterFollowingListEntry>} listMap
 * @param {readonly string[]} candidateUids
 * @returns {{
 *   attempted: number,
 *   ok: number,
 *   forbidden: number,
 *   loginRequired: number,
 *   error: number,
 *   notAttempted: number
 * }}
 */
export function summarizeFollowingListCoverage(listMap, candidateUids) {
  const map = listMap && typeof listMap === 'object' ? listMap : {};
  /** @type {ReturnType<typeof summarizeFollowingListCoverage>} */
  const out = {
    attempted: 0,
    ok: 0,
    forbidden: 0,
    loginRequired: 0,
    error: 0,
    notAttempted: 0
  };
  for (const raw of candidateUids || []) {
    const uid = String(raw || '').trim();
    if (!/^\d{1,18}$/.test(uid)) continue;
    const hit = map[uid];
    if (!hit) {
      out.notAttempted += 1;
      continue;
    }
    out.attempted += 1;
    if (hit.status === 'ok') out.ok += 1;
    else if (hit.status === 'forbidden') out.forbidden += 1;
    else if (hit.status === 'login_required') out.loginRequired += 1;
    else out.error += 1;
  }
  return out;
}
