export const NICO_USER_PROFILE_FETCH_MESSAGE_TYPE = 'NLS_NICO_USER_PROFILE_FETCH';

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
 * @param {unknown} json
 * @returns {{ userId: string, nickname: string, avatarUrl: string }|null}
 */
export function normalizeNicoUserProfileResponse(json) {
  if (!isLikelyNicoUserProfileShape(json)) return null;
  const user = /** @type {Record<string, any>} */ (
    /** @type {Record<string, any>} */ (json).data.user
  );

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
  return { userId, nickname, avatarUrl };
}
