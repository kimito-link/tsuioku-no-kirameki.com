/**
 * 応援ユーザーの「表示の立ち位置」（LP モック・ユーザーレーン並びの共通ルール）
 */

import {
  isNiconicoAnonymousUserId,
  isNiconicoAutoUserPlaceholderNickname
} from './nicoAnonymousDisplay.js';
import { commentEnrichmentAvatarScore } from './supportGrowthTileSrc.js';

export const SUPPORT_GRID_TIER_RINK = 'rink';
export const SUPPORT_GRID_TIER_KONTA = 'konta';
export const SUPPORT_GRID_TIER_TANU = 'tanu';

/**
 * 個人サムネとして採用する https（記録 URL 優先）。合成 canonical のみは返さない。
 * @param {string} userId
 * @param {string} httpAvatarCandidate
 * @param {string} storedAvatarUrl
 * @returns {string} 空なら「個人サムネなし」
 */
export function supportGridPersonalThumbPreferredUrl(
  userId,
  httpAvatarCandidate,
  storedAvatarUrl
) {
  const u = String(userId || '').trim();
  const http = String(httpAvatarCandidate ?? '').trim();
  const raw = String(storedAvatarUrl ?? '').trim();
  /* enrich 層のスコアと一致（合成 canonical=1・それ以外の良い https=2） */
  if (commentEnrichmentAvatarScore(u, raw) >= 2) return raw;
  if (commentEnrichmentAvatarScore(u, http) >= 2) return http;
  return '';
}

/**
 * @param {string} userId
 * @param {string} httpAvatarCandidate
 * @param {string} storedAvatarUrl
 * @returns {boolean}
 */
export function supportGridTierHasPersonalThumb(userId, httpAvatarCandidate, storedAvatarUrl) {
  return Boolean(
    supportGridPersonalThumbPreferredUrl(userId, httpAvatarCandidate, storedAvatarUrl)
  );
}

/**
 * 「プロフィールとして十分」な表示名か（匿名ラベル・未取得は段階を上げない）
 * @param {string} nick
 * @param {string} userId
 */
export function supportGridStrongNickname(nick, userId) {
  const n = String(nick ?? '').trim();
  if (!n) return false;
  /* 数値 ID でもニコの自動表示名 user+英数字 はプロフィール名として扱わない */
  if (isNiconicoAutoUserPlaceholderNickname(n)) return false;
  if (n === '（未取得）' || n === '(未取得)') return false;
  if (n === '匿名') return false;
  if (isNiconicoAnonymousUserId(userId) && n.length <= 1) return false;
  return true;
}

/**
 * アバタースコアの最大値（http候補と保存 URL の両方を考慮）。
 * @param {string} uid
 * @param {string} httpCandidate
 * @param {string} rawAv
 * @returns {0|1|2}
 */
function bestAvatarScore(uid, httpCandidate, rawAv) {
  const a = commentEnrichmentAvatarScore(uid, rawAv);
  const b = commentEnrichmentAvatarScore(uid, httpCandidate);
  return /** @type {0|1|2} */ (Math.max(a, b));
}

/**
 * 応援レーン・グリッドの段付け理由（デバッグ・診断用。PII は含めずフラグのみ）。
 *
 * avatarObserved=true : DOM / intercept でアバターが実際に観測された
 *   → URL の形式に関係なく rink
 * avatarObserved=false / 未指定 : 従来の URL スコアで判定（後方互換）
 *
 * @param {{
 *   userId?: string|null,
 *   nickname?: string|null,
 *   httpAvatarCandidate?: string|null,
 *   storedAvatarUrl?: string|null,
 *   lpMockHasCustomAvatar?: boolean,
 *   avatarObserved?: boolean
 * }} p
 * @returns {{
 *   tier: 'rink'|'konta'|'tanu',
 *   strongNick: boolean,
 *   hasPersonalThumb: boolean,
 *   hasAnyAvatar: boolean,
 *   avatarObserved: boolean,
 *   demotedAnonymousRinkToKonta: boolean,
 *   httpCandidateNonEmpty: boolean,
 *   storedAvatarNonEmpty: boolean
 * }} demotedAnonymousRinkToKonta は互換のため常に false
 */
export function explainSupportGridDisplayTier(p) {
  const uid = String(p?.userId ?? '').trim();
  const nick = String(p?.nickname ?? '').trim();
  const httpCandidate = String(p.httpAvatarCandidate ?? '').trim();
  const rawAv = String(p.storedAvatarUrl ?? '').trim();
  const strongNick = uid ? supportGridStrongNickname(nick, uid) : false;
  const observed = Boolean(p?.avatarObserved);

  let hasThumb = false;
  if (p.lpMockHasCustomAvatar === true) hasThumb = true;
  else if (p.lpMockHasCustomAvatar === false) hasThumb = false;
  else if (uid) {
    hasThumb = supportGridTierHasPersonalThumb(uid, httpCandidate, rawAv);
  }

  const avatarScore = uid ? bestAvatarScore(uid, httpCandidate, rawAv) : 0;
  const hasAnyAvatar = avatarScore >= 1 || observed;

  const storedAvatarScore = uid ? commentEnrichmentAvatarScore(uid, rawAv) : 0;
  const hasObservedAvatar = storedAvatarScore >= 1;

  const isNumericId = /^\d{5,14}$/.test(uid);

  /** @type {ReadonlyArray<{tier: 'rink'|'konta'|'tanu', match: (f: typeof flags) => boolean}>} */
  const TIER_RULES = [
    { tier: SUPPORT_GRID_TIER_RINK,  match: (f) => f.observed },
    { tier: SUPPORT_GRID_TIER_RINK,  match: (f) => f.strongNick && f.hasThumb },
    { tier: SUPPORT_GRID_TIER_RINK,  match: (f) => f.strongNick && f.isNumericId && f.hasObservedAvatar },
    { tier: SUPPORT_GRID_TIER_KONTA, match: (f) => f.strongNick || f.hasThumb },
    { tier: SUPPORT_GRID_TIER_KONTA, match: (f) => f.hasAnyAvatar },
    { tier: SUPPORT_GRID_TIER_KONTA, match: (f) => f.isNumericId },
  ];

  const flags = { observed, strongNick, hasThumb, hasAnyAvatar, hasObservedAvatar, isNumericId };

  /** @type {'rink'|'konta'|'tanu'} */
  const tier = !uid
    ? SUPPORT_GRID_TIER_TANU
    : (TIER_RULES.find(r => r.match(flags))?.tier ?? SUPPORT_GRID_TIER_TANU);

  const demotedAnonymousRinkToKonta = false;

  return {
    tier,
    strongNick,
    hasPersonalThumb: hasThumb,
    hasAnyAvatar,
    avatarObserved: observed,
    demotedAnonymousRinkToKonta,
    httpCandidateNonEmpty: Boolean(httpCandidate),
    storedAvatarNonEmpty: Boolean(rawAv)
  };
}

/**
 * @param {{
 *   userId?: string|null,
 *   nickname?: string|null,
 *   httpAvatarCandidate?: string|null,
 *   storedAvatarUrl?: string|null,
 *   lpMockHasCustomAvatar?: boolean,
 *   avatarObserved?: boolean
 * }} p
 * @returns {'rink'|'konta'|'tanu'}
 */
export function supportGridDisplayTier(p) {
  return explainSupportGridDisplayTier(p).tier;
}
