/**
 * 応援グリッド用タイル画像 URL の優先解決（純関数）
 */

/**
 * @param {unknown} url
 * @returns {boolean}
 */
export function isHttpOrHttpsUrl(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s);
}

/**
 * @param {{
 *   entryAvatarUrl?: string|null,
 *   isOwnPosted?: boolean,
 *   viewerAvatarUrl?: string|null,
 *   defaultSrc: string
 * }} p
 * @returns {string}
 */
export function resolveSupportGrowthTileSrc(p) {
  const def = String(p.defaultSrc || '');
  if (isHttpOrHttpsUrl(p.entryAvatarUrl)) {
    return String(p.entryAvatarUrl).trim();
  }
  if (p.isOwnPosted && isHttpOrHttpsUrl(p.viewerAvatarUrl)) {
    return String(p.viewerAvatarUrl).trim();
  }
  return def;
}
