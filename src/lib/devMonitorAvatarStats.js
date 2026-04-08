/**
 * 開発者向け監視: storage コメント配列からアバター／userId の集計（PII なし・件数のみ）
 */

import {
  isHttpOrHttpsUrl,
  isAnonymousStyleNicoUserId,
  isNiconicoSyntheticDefaultUserIconUrl
} from './supportGrowthTileSrc.js';

/**
 * @typedef {{
 *   total: number,
 *   withHttpAvatar: number,
 *   withoutHttpAvatar: number,
 *   syntheticDefaultAvatar: number,
 *   numericUserId: number,
 *   nonNumericUserId: number,
 *   missingUserId: number,
 *   withNickname: number,
 *   withoutNickname: number,
 *   withResolvedAvatar?: number
 * }} StoredCommentAvatarStats
 */

/**
 * @typedef {{
 *   numericUidWithHttpAvatar: number,
 *   numericUidWithoutHttpAvatar: number,
 *   anonStyleUidWithHttpAvatar: number,
 *   anonStyleUidWithoutHttpAvatar: number,
 *   numericWithNickname: number,
 *   numericWithoutNickname: number,
 *   anonWithNickname: number,
 *   anonWithoutNickname: number
 * }} StoredCommentProfileGaps
 */

/**
 * userId あり行のみクロス集計（欠損 userId はここでは数えない）。
 * @param {unknown} entries
 * @returns {StoredCommentProfileGaps}
 */
export function summarizeStoredCommentProfileGaps(entries) {
  const empty = {
    numericUidWithHttpAvatar: 0,
    numericUidWithoutHttpAvatar: 0,
    anonStyleUidWithHttpAvatar: 0,
    anonStyleUidWithoutHttpAvatar: 0,
    numericWithNickname: 0,
    numericWithoutNickname: 0,
    anonWithNickname: 0,
    anonWithoutNickname: 0
  };
  if (!Array.isArray(entries)) return empty;

  let numericUidWithHttpAvatar = 0;
  let numericUidWithoutHttpAvatar = 0;
  let anonStyleUidWithHttpAvatar = 0;
  let anonStyleUidWithoutHttpAvatar = 0;
  let numericWithNickname = 0;
  let numericWithoutNickname = 0;
  let anonWithNickname = 0;
  let anonWithoutNickname = 0;

  for (const e of entries) {
    const uid = String(e?.userId ?? '').trim();
    if (!uid) continue;

    const av = String(e?.avatarUrl || '').trim();
    const http = isHttpOrHttpsUrl(av);
    const nick = String(e?.nickname ?? '').trim();
    const hasNick = Boolean(nick);

    const numeric = /^\d{5,14}$/.test(uid);
    if (numeric) {
      if (http) numericUidWithHttpAvatar += 1;
      else numericUidWithoutHttpAvatar += 1;
      if (hasNick) numericWithNickname += 1;
      else numericWithoutNickname += 1;
    } else if (isAnonymousStyleNicoUserId(uid)) {
      if (http) anonStyleUidWithHttpAvatar += 1;
      else anonStyleUidWithoutHttpAvatar += 1;
      if (hasNick) anonWithNickname += 1;
      else anonWithoutNickname += 1;
    }
  }

  return {
    numericUidWithHttpAvatar,
    numericUidWithoutHttpAvatar,
    anonStyleUidWithHttpAvatar,
    anonStyleUidWithoutHttpAvatar,
    numericWithNickname,
    numericWithoutNickname,
    anonWithNickname,
    anonWithoutNickname
  };
}

/**
 * @param {unknown} entries
 * @returns {StoredCommentAvatarStats}
 */
export function summarizeStoredCommentAvatarStats(entries) {
  const empty = {
    total: 0,
    withHttpAvatar: 0,
    withoutHttpAvatar: 0,
    syntheticDefaultAvatar: 0,
    numericUserId: 0,
    nonNumericUserId: 0,
    missingUserId: 0,
    withNickname: 0,
    withoutNickname: 0
  };
  if (!Array.isArray(entries)) return empty;

  let withHttpAvatar = 0;
  let withoutHttpAvatar = 0;
  let syntheticDefaultAvatar = 0;
  let numericUserId = 0;
  let nonNumericUserId = 0;
  let missingUserId = 0;
  let withNickname = 0;
  let withoutNickname = 0;

  for (const e of entries) {
    const av = String(e?.avatarUrl || '').trim();
    const uid = String(e?.userId ?? '').trim();
    const nick = String(e?.nickname ?? '').trim();
    if (nick) withNickname += 1;
    else withoutNickname += 1;
    const http = isHttpOrHttpsUrl(av);
    if (http) {
      withHttpAvatar += 1;
      if (/^\d{5,14}$/.test(uid) && isNiconicoSyntheticDefaultUserIconUrl(av, uid)) {
        syntheticDefaultAvatar += 1;
      }
    } else {
      withoutHttpAvatar += 1;
    }
    if (!uid) missingUserId += 1;
    else if (/^\d{5,14}$/.test(uid)) numericUserId += 1;
    else nonNumericUserId += 1;
  }

  return {
    total: entries.length,
    withHttpAvatar,
    withoutHttpAvatar,
    syntheticDefaultAvatar,
    numericUserId,
    nonNumericUserId,
    missingUserId,
    withNickname,
    withoutNickname
  };
}
