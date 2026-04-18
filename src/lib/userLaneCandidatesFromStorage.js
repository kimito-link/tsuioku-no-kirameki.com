/**
 * 応援ユーザーレーン用: nls_comments 相当の StoredComment 配列から userId 単位に集約した候補。
 *
 * 第2引数 liveId を省略（または null / 空文字）のときは liveId で絞り込まず集約する（契約 I6）。
 * popup からは当放送の lvId を渡し、別放送の行を混ぜない。
 */

import { pickStrongestAvatarUrlForUser } from './supportGrowthTileSrc.js';
import { supportGridStrongNickname } from './supportGridDisplayTier.js';

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   avatarUrl: string,
 *   avatarObserved: boolean,
 *   liveId: string
 * }} UserLaneCandidateFromStorage
 */

/**
 * @param {unknown} row
 * @returns {string}
 */
function rowLiveId(row) {
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row);
  return String(o?.liveId ?? o?.lvId ?? '').trim();
}

/**
 * @param {unknown} row
 * @returns {number}
 */
function rowCapturedAt(row) {
  const n = Number(/** @type {{ capturedAt?: unknown }} */ (row)?.capturedAt);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {readonly unknown[]|null|undefined} storedComments
 * @param {string|null|undefined} [liveId] 省略時は全 live を対象。非空のときは当該放送のみ。
 * @returns {readonly Readonly<UserLaneCandidateFromStorage>[]}
 */
export function userLaneCandidatesFromStorage(storedComments, liveId) {
  const filterByLive =
    arguments.length >= 2 && liveId != null && String(liveId).trim() !== '';
  const lidNorm = filterByLive ? String(liveId).trim() : '';
  const lidLower = lidNorm.toLowerCase();

  const rows = (Array.isArray(storedComments) ? storedComments : []).filter(
    (e) => !filterByLive || rowLiveId(e).toLowerCase() === lidLower
  );

  /** @type {Map<string, unknown[]>} */
  const byUid = new Map();
  for (const row of rows) {
    const uid = String(/** @type {{ userId?: unknown }} */ (row)?.userId ?? '').trim();
    if (!uid) continue;
    const g = byUid.get(uid);
    if (g) g.push(row);
    else byUid.set(uid, [row]);
  }

  /** @type {UserLaneCandidateFromStorage[]} */
  const built = [];
  for (const [userId, group] of byUid) {
    const chronological = [...group].sort(
      (a, b) => rowCapturedAt(a) - rowCapturedAt(b)
    );
    let observed = false;
    /** @type {string[]} */
    const urls = [];
    for (const g of chronological) {
      if (/** @type {{ avatarObserved?: boolean }} */ (g).avatarObserved === true) {
        observed = true;
      }
      const u = String(/** @type {{ avatarUrl?: unknown }} */ (g).avatarUrl ?? '').trim();
      if (u) urls.push(u);
    }
    const avatarUrl = pickStrongestAvatarUrlForUser(userId, urls);

    const newestFirst = [...chronological].sort(
      (a, b) => rowCapturedAt(b) - rowCapturedAt(a)
    );
    let nickname = '';
    for (const g of newestFirst) {
      const n = String(/** @type {{ nickname?: unknown }} */ (g).nickname ?? '').trim();
      if (supportGridStrongNickname(n, userId)) {
        nickname = n;
        break;
      }
    }
    if (!nickname && newestFirst.length > 0) {
      nickname = String(
        /** @type {{ nickname?: unknown }} */ (newestFirst[0]).nickname ?? ''
      ).trim();
    }

    const lastCapturedAt = Math.max(0, ...chronological.map(rowCapturedAt));

    const outLiveId = filterByLive
      ? lidNorm
      : rowLiveId(newestFirst[0] || chronological[chronological.length - 1] || {});

    built.push({
      userId,
      nickname,
      avatarUrl,
      avatarObserved: observed,
      liveId: outLiveId,
      _laneSortAt: lastCapturedAt
    });
  }

  built.sort((a, b) => (b._laneSortAt || 0) - (a._laneSortAt || 0));

  const frozen = Object.freeze(
    built.map((row) =>
      Object.freeze({
        userId: row.userId,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl,
        avatarObserved: row.avatarObserved,
        liveId: row.liveId
      })
    )
  );
  return /** @type {readonly Readonly<UserLaneCandidateFromStorage>[]} */ (frozen);
}
