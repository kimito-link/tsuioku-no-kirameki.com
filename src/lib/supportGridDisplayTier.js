/**
 * 応援ユーザーの「表示の立ち位置」（LP モック・ユーザーレーン並びの共通ルール）
 */

import { isNiconicoAnonymousUserId } from './nicoAnonymousDisplay.js';
import {
  isHttpOrHttpsUrl,
  isWeakNiconicoUserIconHttpUrl,
  niconicoDefaultUserIconUrl
} from './supportGrowthTileSrc.js';

export const SUPPORT_GRID_TIER_RINK = 'rink';
export const SUPPORT_GRID_TIER_KONTA = 'konta';
export const SUPPORT_GRID_TIER_TANU = 'tanu';

/** @param {string} u */
function goodUserThumbUrl(u) {
  const s = String(u || '').trim();
  return isHttpOrHttpsUrl(s) && !isWeakNiconicoUserIconHttpUrl(s);
}

/**
 * りんく段階用: 記録上の URL がある、または「ID から式で組んだだけの canonical usericon URL」以外の https がある。
 * canonical のみ（未取得・404 でグレー表示になりがち）は個人サムネ「あり」とみなさない。
 *
 * @param {string} userId
 * @param {string} httpAvatarCandidate storyGrowthAvatarSrcCandidate 等
 * @param {string} storedAvatarUrl entry.avatarUrl
 */
export function supportGridTierHasPersonalThumb(userId, httpAvatarCandidate, storedAvatarUrl) {
  const u = String(userId || '').trim();
  const http = String(httpAvatarCandidate ?? '').trim();
  const raw = String(storedAvatarUrl ?? '').trim();
  const syn =
    u && /^\d{5,14}$/.test(u) ? String(niconicoDefaultUserIconUrl(u) || '').trim() : '';

  if (goodUserThumbUrl(raw)) return true;
  if (goodUserThumbUrl(http) && (!syn || http !== syn)) return true;
  return false;
}

/**
 * 「プロフィールとして十分」な表示名か（匿名ラベル・未取得は段階を上げない）
 * @param {string} nick
 * @param {string} userId
 */
export function supportGridStrongNickname(nick, userId) {
  const n = String(nick ?? '').trim();
  if (!n) return false;
  if (n === '（未取得）' || n === '(未取得)') return false;
  if (n === '匿名') return false;
  if (isNiconicoAnonymousUserId(userId) && n.length <= 1) return false;
  return true;
}

/**
 * @param {{
 *   userId?: string|null,
 *   nickname?: string|null,
 *   httpAvatarCandidate?: string|null,
 *   storedAvatarUrl?: string|null,
 *   lpMockHasCustomAvatar?: boolean
 * }} p
 * @returns {'rink'|'konta'|'tanu'}
 */
export function supportGridDisplayTier(p) {
  const uid = String(p?.userId ?? '').trim();
  if (!uid) return SUPPORT_GRID_TIER_TANU;

  let hasThumb = false;
  if (p.lpMockHasCustomAvatar === true) hasThumb = true;
  else if (p.lpMockHasCustomAvatar === false) hasThumb = false;
  else {
    const httpCandidate = String(p.httpAvatarCandidate ?? '').trim();
    const rawAv = String(p.storedAvatarUrl ?? '').trim();
    hasThumb = supportGridTierHasPersonalThumb(uid, httpCandidate, rawAv);
  }

  const nick = String(p?.nickname ?? '').trim();
  const strongNick = supportGridStrongNickname(nick, uid);

  if (strongNick && hasThumb) return SUPPORT_GRID_TIER_RINK;
  if (strongNick || hasThumb) return SUPPORT_GRID_TIER_KONTA;
  return SUPPORT_GRID_TIER_TANU;
}
