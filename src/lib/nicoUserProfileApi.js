export const NICO_USER_PROFILE_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_PROFILE_FETCH';
/** プロフィール HTML ページ取得用メッセージ型（background.js と文字列同期）。 */
export const NICO_USER_PROFILE_PAGE_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_PROFILE_PAGE_FETCH';

const UID_RE = /^\d{1,18}$/;

/**
 * @param {unknown} uid
 * @returns {boolean}
 */
export function isResolvableNicoUid(uid) {
  const s = String(uid == null ? '' : uid).trim();
  return UID_RE.test(s) && Number(s) > 0;
}

/**
 * @param {string|number} uid
 * @returns {string|null}
 */
export function buildNicoUserProfileUrl(uid) {
  const s = String(uid == null ? '' : uid).trim();
  if (!isResolvableNicoUid(s)) return null;
  return 'https://nvapi.nicovideo.jp/v1/users/' + encodeURIComponent(s);
}

/**
 * @param {unknown} json
 * @returns {boolean}
 */
export function isLikelyNicoUserProfileShape(json) {
  if (!json || typeof json !== 'object') return false;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return false;
  }
  return !!(
    j.data &&
    typeof j.data === 'object' &&
    j.data.user &&
    typeof j.data.user === 'object'
  );
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const s = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function asPosIntOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/**
 * @param {unknown} json
 * @returns {{
 *   userId: string,
 *   nickname: string,
 *   avatarUrl: string,
 *   level?: number,
 *   isPremium?: boolean,
 *   followeeCount?: number,
 *   followerCount?: number
 * }|null}
 */
export function normalizeNicoUserProfileResponse(json) {
  if (!isLikelyNicoUserProfileShape(json)) return null;
  const data = /** @type {Record<string, any>} */ (/** @type {Record<string, any>} */ (json).data);
  const user = /** @type {Record<string, any>} */ (data.user);

  const userId = String(user.id == null ? '' : user.id).trim();
  if (!isResolvableNicoUid(userId)) return null;

  const nickname = String(user.nickname == null ? '' : user.nickname)
    .trim()
    .slice(0, 200);

  let avatarUrl = '';
  const icons = user.icons;
  if (icons && typeof icons === 'object') {
    avatarUrl = sanitizeHttpUrl(icons.large) || sanitizeHttpUrl(icons.small);
  }

  if (!nickname && !avatarUrl) return null;

  /**
   * @type {{ userId: string, nickname: string, avatarUrl: string,
   *   level?: number, isPremium?: boolean, followeeCount?: number, followerCount?: number }}
   */
  const out = { userId, nickname, avatarUrl };

  // 取得できた拡張項目だけ best-effort で付与（無ければ従来形のまま）。
  const level =
    asPosIntOrNull(user.userLevel && user.userLevel.currentLevel) ??
    asPosIntOrNull(user.niconicoLevel) ??
    asPosIntOrNull(user.level);
  if (level != null) out.level = level;

  if (user.isPremium === true || user.premium === true) out.isPremium = true;
  else if (user.isPremium === false || user.premium === false) out.isPremium = false;

  const followeeCount =
    asPosIntOrNull(data.followeeCount) ?? asPosIntOrNull(user.followeeCount);
  if (followeeCount != null) out.followeeCount = followeeCount;

  const followerCount =
    asPosIntOrNull(data.followerCount) ?? asPosIntOrNull(user.followerCount);
  if (followerCount != null) out.followerCount = followerCount;

  return out;
}
