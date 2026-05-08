/**
 * v0.1.203 Patch 1: niconico ユーザー UID から avatar URL を確定パターンで生成する純関数。
 *
 * パターン（公開情報・実機で確認済）:
 *   https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/<UID/10000>/<UID>.jpg
 *
 * 例:
 *   uid = 143172392 → s/14317/143172392.jpg
 *   uid = 2913665   → s/291/2913665.jpg
 *   uid = 99        → s/0/99.jpg
 *
 * 既存 intercept hook が壊滅的に弱い（avatarMapSize=12 vs interceptedUsersTotal=69）状況で、
 * UID から avatar URL を **常時生成可能** にすることで、avatar 取得率を 100% に近づける。
 *
 * intercept で取れた avatar はリモート画像が実在する保証あり。生成 URL は推測なので、
 * 画像 onerror 時にフォールバック（既存 storyAvatarLoadGuard 等）が必要。
 *
 * 副作用なし。
 */

const AVATAR_HOST = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon';

/**
 * @typedef {'s'|'m'} AvatarSize
 *   's': 標準（実機で観測される URL）
 *   'm': 中サイズ（一部用途）
 */

/**
 * niconico UID から avatar URL を生成する。
 *
 * @param {string|number|null|undefined} uid
 * @param {AvatarSize} [size='s']
 * @returns {string} 生成 URL（uid が無効なら空文字）
 */
export function deriveAvatarUrlFromUid(uid, size = 's') {
  const numUid = normalizeUid(uid);
  if (numUid == null) return '';
  const dirNum = Math.floor(numUid / 10000);
  const sz = size === 'm' ? 'm' : 's';
  return `${AVATAR_HOST}/${sz}/${dirNum}/${numUid}.jpg`;
}

/**
 * uid を有効な整数に正規化（無効なら null）
 *
 * @param {unknown} uid
 * @returns {number|null}
 */
function normalizeUid(uid) {
  if (uid == null) return null;
  if (typeof uid === 'number') {
    if (!Number.isFinite(uid) || uid < 0 || !Number.isInteger(uid)) return null;
    return uid;
  }
  if (typeof uid === 'string') {
    const t = uid.trim();
    if (!/^[0-9]+$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }
  return null;
}

/**
 * 与えられた URL が niconico avatar の確定パターンに一致するか判定。
 * 一致する場合は UID を返す。
 *
 * @param {string|null|undefined} url
 * @returns {string|null} UID（数字のみ）or null
 */
export function extractUidFromAvatarUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  const m = url.match(
    /\/nicoaccount\/usericon\/[sm]\/\d+\/(\d+)\.(?:jpg|jpeg|png|gif)$/i
  );
  return m ? m[1] : null;
}

/**
 * UID と既存 avatar map から、最終的に使うべき avatar URL を返す。
 * intercept hook で取れた URL があればそれを優先、なければ生成 URL。
 *
 * @param {string|number} uid
 * @param {Map<string, string>|Record<string, string>|null|undefined} interceptedAvatars  intercept 経路で取れた map
 * @param {AvatarSize} [size='s']
 * @returns {string}
 */
export function pickAvatarUrlForUid(uid, interceptedAvatars, size = 's') {
  const numUid = normalizeUid(uid);
  if (numUid == null) return '';
  const key = String(numUid);
  let intercepted = '';
  if (interceptedAvatars instanceof Map) {
    intercepted = interceptedAvatars.get(key) || '';
  } else if (interceptedAvatars && typeof interceptedAvatars === 'object') {
    intercepted = /** @type {any} */ (interceptedAvatars)[key] || '';
  }
  if (intercepted) return intercepted;
  return deriveAvatarUrlFromUid(numUid, size);
}
