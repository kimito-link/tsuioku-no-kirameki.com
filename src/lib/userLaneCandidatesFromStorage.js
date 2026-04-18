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
 *   liveId: string,
 *   _laneSortAt?: number
 * }} UserLaneCandidateFromStorage
 */

/**
 * lvId の表記ゆれ（lv 接頭辞・大文字小文字）を揃える。
 * @param {unknown} v
 * @returns {string}
 */
export function normalizeLv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  return s.startsWith('lv') ? s : `lv${s}`;
}

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
 * @param {string} targetNorm normalizeLv 済みの比較キー
 * @returns {boolean}
 */
function rowMatchesLiveFilter(row, targetNorm) {
  if (!targetNorm) return true;
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row);
  const a = normalizeLv(o?.liveId);
  const b = normalizeLv(o?.lvId);
  return (Boolean(a) && a === targetNorm) || (Boolean(b) && b === targetNorm);
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
  const targetNorm = filterByLive ? normalizeLv(lidNorm) : '';

  const allRows = Array.isArray(storedComments) ? storedComments : [];
  let rows = filterByLive
    ? allRows.filter((e) => rowMatchesLiveFilter(e, targetNorm))
    : allRows;
  /** 集約結果の liveId 表示に lid を使うか（フォールバック後は行ベース） */
  let useLidForOutput = filterByLive;
  if (filterByLive && rows.length === 0) {
    console.warn('[lane] filter matched 0, fallback all');
    rows = allRows;
    useLidForOutput = false;
  }

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

    const outLiveId = useLidForOutput
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
