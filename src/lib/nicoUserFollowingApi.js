/**
 * nvapi /v1/users/{uid}/following/users の URL 構築とレスポンス正規化。
 * chrome / fetch には依存しない（background.js が fetch する）。
 */

import { isResolvableNicoUid } from './nicoUserProfileApi.js';

export const NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_FOLLOWING_FETCH';

const NVAPI_FOLLOWING_BASE = 'https://nvapi.nicovideo.jp/v1/users';

/**
 * @typedef {{
 *   userIds: string[],
 *   totalCount?: number,
 *   nextPage?: number,
 *   nextCursor?: string
 * }} NicoUserFollowingListPage
 */

/**
 * @param {string|number} uid
 * @param {{ pageSize?: number, page?: number, cursor?: string }} [opts]
 * @returns {string|null}
 */
export function buildNicoUserFollowingListUrl(uid, opts = {}) {
  const id = String(uid == null ? '' : uid).trim();
  if (!isResolvableNicoUid(id)) return null;
  const pageSize = Number(opts.pageSize);
  const page = Number(opts.page);
  const cursor = String(opts.cursor || '').trim();
  const params = new URLSearchParams();
  if (Number.isFinite(pageSize) && pageSize > 0) {
    params.set('pageSize', String(Math.min(800, Math.floor(pageSize))));
  }
  if (Number.isFinite(page) && page > 0) params.set('page', String(Math.floor(page)));
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return `${NVAPI_FOLLOWING_BASE}/${encodeURIComponent(id)}/following/users${qs ? `?${qs}` : ''}`;
}

/**
 * @param {unknown} json
 * @returns {boolean}
 */
export function isLikelyNicoUserFollowingListShape(json) {
  if (!json || typeof json !== 'object') return false;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return false;
  }
  return !!(j.data && typeof j.data === 'object' && Array.isArray(j.data.items));
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function extractFollowingUserId(value) {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') {
    const s = String(value).trim();
    return isResolvableNicoUid(s) ? s : null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = /** @type {Record<string, unknown>} */ (value);
    return extractFollowingUserId(o.id ?? o.userId);
  }
  return null;
}

/**
 * @param {unknown} json
 * @returns {NicoUserFollowingListPage|null}
 */
export function normalizeNicoUserFollowingListPage(json) {
  if (!isLikelyNicoUserFollowingListShape(json)) return null;
  const data = /** @type {Record<string, unknown>} */ (
    /** @type {Record<string, unknown>} */ (json).data
  );
  const items = Array.isArray(data.items) ? data.items : [];
  /** @type {string[]} */
  const userIds = [];
  const seen = new Set();
  for (const item of items) {
    const uid = extractFollowingUserId(item);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    userIds.push(uid);
  }
  const totalCountRaw = data.totalCount ?? data.total ?? data.count;
  const totalCount = Number(totalCountRaw);
  /** @type {NicoUserFollowingListPage} */
  const out = { userIds };
  if (Number.isFinite(totalCount) && totalCount >= 0) out.totalCount = Math.floor(totalCount);
  const nextPage = Number(data.nextPage);
  if (Number.isFinite(nextPage) && nextPage > 0) out.nextPage = Math.floor(nextPage);
  const nextCursor = String(data.nextCursor ?? data.cursor ?? '').trim();
  if (nextCursor) out.nextCursor = nextCursor;
  return out;
}

/**
 * 複数ページ分をマージする（background 側でも使える純関数）。
 * @param {readonly NicoUserFollowingListPage[]} pages
 * @param {{ maxUserIds?: number }} [opts]
 * @returns {{ userIds: string[], totalCount?: number, truncated: boolean, pageCount: number }}
 */
export function mergeNicoUserFollowingListPages(pages, opts = {}) {
  const maxUserIds =
    Number.isFinite(Number(opts.maxUserIds)) && Number(opts.maxUserIds) > 0
      ? Math.floor(Number(opts.maxUserIds))
      : 200;
  /** @type {string[]} */
  const userIds = [];
  const seen = new Set();
  let totalCount;
  let pageCount = 0;
  for (const page of pages || []) {
    if (!page) continue;
    pageCount += 1;
    if (totalCount == null && typeof page.totalCount === 'number') totalCount = page.totalCount;
    for (const uid of page.userIds || []) {
      if (seen.has(uid)) continue;
      seen.add(uid);
      userIds.push(uid);
      if (userIds.length >= maxUserIds) {
        return { userIds, totalCount, truncated: true, pageCount };
      }
    }
  }
  return { userIds, totalCount, truncated: false, pageCount };
}

/**
 * nvapi JSON の meta.status を取り出す（HTTP 200 でも body 側が 401 等のことがある）。
 * @param {unknown} json
 * @returns {number|null}
 */
export function extractNvapiMetaStatus(json) {
  if (!json || typeof json !== 'object') return null;
  const ms = Number(/** @type {{ status?: unknown }} */ (/** @type {Record<string, unknown>} */ (json).meta).status);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * HTTP ステータスからフォロー一覧取得結果の status を推定する。
 * @param {number} status
 * @param {unknown} json
 * @returns {'ok'|'forbidden'|'login_required'|'error'}
 */
export function classifyFollowingListFetchStatus(status, json) {
  const metaStatus = extractNvapiMetaStatus(json);
  const code = metaStatus != null ? metaStatus : Number(status);
  if (code === 401) return 'login_required';
  if (code === 403 || code === 404) return 'forbidden';
  if (code >= 200 && code < 300 && isLikelyNicoUserFollowingListShape(json)) return 'ok';
  return 'error';
}
