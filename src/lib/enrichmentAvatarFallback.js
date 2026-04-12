import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';

/**
 * enrichRowsWithInterceptedUserIds 内で、全ソースにアバターURLがない場合に
 * 数値 userId から canonical CDN URL をフォールバック生成する（純関数）。
 *
 * 既存ソース（intercept entry, intercept map, DOM row）のいずれかに
 * URL がある場合は空を返し、既存の優先ロジックに委ねる。
 *
 * @param {string} userId
 * @param {string} interceptEntryAv
 * @param {string} interceptMapAv
 * @param {string} rowAv
 * @returns {string} canonical URL or ''
 */
export function enrichmentAvatarWithCanonicalFallback(
  userId,
  interceptEntryAv,
  interceptMapAv,
  rowAv
) {
  if (interceptEntryAv || interceptMapAv || rowAv) return '';
  return niconicoDefaultUserIconUrl(userId);
}
