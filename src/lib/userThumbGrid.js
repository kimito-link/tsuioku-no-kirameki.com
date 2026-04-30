/**
 * 「サムネ付きユーザー一覧」のカテゴリ分け純粋関数。
 *
 * 0.1.15 (L): HTML レポート / マーケ分析の両方で同じ「数値 ID と 匿名 を分けて
 *   並べたい」要件があるので、共通の categorize ロジックを 1 箇所に集約。
 *   呼び出し側はカテゴリ済みデータを受け取って、それぞれの環境向けに HTML を
 *   組む（class 名・テーマ色・h2 文言は context によって違うため）。
 *
 * 純粋関数のみ。DOM/storage 非依存（vitest 単体検証用）。
 */

import { resolveReportUserThumbSrc } from './reportUserThumb.js';

/** @type {'numeric'} */
export const THUMB_USER_KIND_NUMERIC = 'numeric';
/** @type {'anonymous'} */
export const THUMB_USER_KIND_ANONYMOUS = 'anonymous';

/**
 * @typedef {{
 *   userId: string,
 *   nickname?: string,
 *   avatarUrl?: string,
 *   count: number
 * }} RawThumbGridUser
 */

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   count: number,
 *   thumbSrc: string,
 *   kind: 'numeric' | 'anonymous'
 * }} ResolvedThumbGridUser
 */

/**
 * @param {string} userId
 * @returns {boolean}
 */
function isNumericNicoUserId(userId) {
  return /^\d{5,14}$/.test(String(userId || '').trim());
}

/**
 * @param {string} userId
 * @returns {boolean}
 */
function isAnonymousLikeUserId(userId) {
  const s = String(userId || '').trim();
  if (!s) return false;
  if (/^a:/i.test(s)) return true;
  if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return true;
  return false;
}

/**
 * 入力ユーザー配列を「数値 ID（個人サムネ or ニコ既定アイコン）」と
 * 「匿名（identicon）」の 2 カテゴリに分ける。サムネが解決できないものは
 * skippedCount で集計（grid から除外）。
 *
 * @param {readonly RawThumbGridUser[] | null | undefined} users
 *   通常はコメ件数の多い順で渡す（出力もその順を保つ）。
 * @param {{
 *   identiconResolver?: (uid: string) => string,
 *   maxNumeric?: number,
 *   maxAnonymous?: number,
 *   broadcasterUserId?: string
 * }} [opts]
 * @returns {{
 *   numericIdUsers: ResolvedThumbGridUser[],
 *   anonymousUsers: ResolvedThumbGridUser[],
 *   skippedCount: number
 * }}
 */
export function categorizeUsersForThumbGrid(users, opts = {}) {
  /** @type {ResolvedThumbGridUser[]} */
  const numericIdUsers = [];
  /** @type {ResolvedThumbGridUser[]} */
  const anonymousUsers = [];
  let skippedCount = 0;
  const maxNumeric = Number.isFinite(opts.maxNumeric)
    ? Number(opts.maxNumeric)
    : Number.POSITIVE_INFINITY;
  const maxAnonymous = Number.isFinite(opts.maxAnonymous)
    ? Number(opts.maxAnonymous)
    : Number.POSITIVE_INFINITY;
  // 0.1.17 (R): 配信者本人 userId を除外。型違いは握りつぶす（呼び出し側は
  // snapshot.broadcasterUserId をそのまま渡すので空文字や undefined もありうる）。
  const broadcasterUid =
    typeof opts.broadcasterUserId === 'string'
      ? String(opts.broadcasterUserId).trim()
      : '';

  if (!Array.isArray(users)) {
    return { numericIdUsers, anonymousUsers, skippedCount: 0 };
  }

  for (const u of users) {
    const userId = String(u?.userId || '').trim();
    if (!userId || userId === '__unknown__') {
      skippedCount += 1;
      continue;
    }
    if (broadcasterUid && userId === broadcasterUid) {
      // 配信者本人は応援される側 — 一覧から除外する
      skippedCount += 1;
      continue;
    }
    const thumbSrc = resolveReportUserThumbSrc({
      userId,
      avatarUrl: u?.avatarUrl || '',
      identiconResolver: opts.identiconResolver
    });
    if (!thumbSrc) {
      skippedCount += 1;
      continue;
    }
    const nickname = String(u?.nickname || '');
    const count = Number(u?.count || 0);
    if (isNumericNicoUserId(userId)) {
      if (numericIdUsers.length < maxNumeric) {
        numericIdUsers.push({
          userId,
          nickname,
          count,
          thumbSrc,
          kind: THUMB_USER_KIND_NUMERIC
        });
      }
    } else if (isAnonymousLikeUserId(userId)) {
      if (anonymousUsers.length < maxAnonymous) {
        anonymousUsers.push({
          userId,
          nickname,
          count,
          thumbSrc,
          kind: THUMB_USER_KIND_ANONYMOUS
        });
      }
    } else {
      // 短すぎる数値、未知パターン等
      skippedCount += 1;
    }
  }

  return { numericIdUsers, anonymousUsers, skippedCount };
}
