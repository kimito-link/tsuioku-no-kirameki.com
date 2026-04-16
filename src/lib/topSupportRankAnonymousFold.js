import { isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';
import { UNKNOWN_USER_KEY } from './userRooms.js';

/**
 * @typedef {{
 *   userKey: string,
 *   count: number,
 *   recentCount?: number,
 *   lastAt?: number,
 *   avatarUrl?: string,
 *   nickname?: string
 * }} RankedRoomLike
 */

/**
 * userKey が「数値 ID で個人アイコン期待できる」側なら false、
 * 匿名（a:xxxxx / ハッシュ系） or 未取得なら true。
 * UNKNOWN_USER_KEY は匿名扱いせず別カテゴリ（最初に来たら残す）。
 *
 * @param {string} userKey
 * @returns {boolean}
 */
export function isAnonymousLikeRoomKey(userKey) {
  const key = String(userKey || '').trim();
  if (!key) return true;
  if (key === UNKNOWN_USER_KEY) return false;
  return isAnonymousStyleNicoUserId(key);
}

/**
 * 応援ランクストリップ向けに匿名ユーザーを後ろへ送る並び替え。
 *
 * 入力は「すでに主要スコア（件数など）で降順ソート済み」であること。
 * 既定でそれぞれのバケット内の相対順は保つ。
 *
 * - UNKNOWN_USER_KEY は先頭に来ていたらそのまま先頭付近に残す（UI 側の place 番号計算は UNKNOWN をスキップする前提）
 * - 数値 ID（個人アイコンが期待できる）ユーザーを次に並べる
 * - 匿名・ハッシュ系ユーザーは最後
 *
 * @template {RankedRoomLike} T
 * @param {T[]} ranked
 * @param {{ foldAnonymous?: boolean }} [opts]
 * @returns {T[]}
 */
export function partitionRankedRoomsForStrip(ranked, opts) {
  const list = Array.isArray(ranked) ? ranked : [];
  const foldAnonymous = opts?.foldAnonymous !== false;
  if (!foldAnonymous) return list.slice();

  /** @type {T[]} */
  const unknownBucket = [];
  /** @type {T[]} */
  const knownBucket = [];
  /** @type {T[]} */
  const anonymousBucket = [];

  for (const row of list) {
    const key = String(row?.userKey ?? '');
    if (key === UNKNOWN_USER_KEY) {
      unknownBucket.push(row);
      continue;
    }
    if (isAnonymousLikeRoomKey(key)) {
      anonymousBucket.push(row);
    } else {
      knownBucket.push(row);
    }
  }

  return [...unknownBucket, ...knownBucket, ...anonymousBucket];
}
