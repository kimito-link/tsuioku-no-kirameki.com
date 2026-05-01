/**
 * 応援ユーザーレーン用: nls_comments 相当の StoredComment 配列から userId 単位に集約した候補。
 *
 * 第2引数 liveId を省略（または null / 空文字）のときは liveId で絞り込まず集約する（契約 I6）。
 * popup からは当放送の lvId を渡し、別放送の行を混ぜない。
 */

import { normalizeLv as normalizeLvCanonical } from '../shared/niconico/liveId.js';
import { pickStrongestAvatarUrlForUser } from './supportGrowthTileSrc.js';
import { supportGridStrongNickname } from './supportGridDisplayTier.js';
import { isSameAvatarUrl } from './avatarUrlCompare.js';
import { isAvatarUrlForUserId } from './avatarBroadcasterGuard.js';

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
 *
 * @deprecated 正本は `src/shared/niconico/liveId.js#normalizeLv`。
 *             このファイルからの re-export は既存 import 互換のための shim。
 * @param {unknown} v
 * @returns {string}
 */
export function normalizeLv(v) {
  return normalizeLvCanonical(v);
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
 * @param {{ broadcasterUid?: string, broadcasterIconUrl?: string }} [opts]
 *   0.1.79: ギフト演出 DOM での avatar 取り違え対策。
 *     コメ記録に焼き込まれた avatarUrl のうち、broadcaster icon と一致する URL は
 *     viewer (uid !== broadcasterUid) には紐付けず破棄する。
 *     未指定時はガード掛けず（false positive 回避）。
 * @returns {readonly Readonly<UserLaneCandidateFromStorage>[]}
 */
export function userLaneCandidatesFromStorage(storedComments, liveId, opts) {
  const filterByLive =
    arguments.length >= 2 && liveId != null && String(liveId).trim() !== '';
  const lidNorm = filterByLive ? String(liveId).trim() : '';
  const targetNorm = filterByLive ? normalizeLv(lidNorm) : '';
  const broadcasterUid = String(opts?.broadcasterUid ?? '').trim();
  const broadcasterIconUrl = String(opts?.broadcasterIconUrl ?? '').trim();
  const broadcasterGuardEnabled = Boolean(broadcasterUid && broadcasterIconUrl);

  const allRows = Array.isArray(storedComments) ? storedComments : [];
  let rows = filterByLive
    ? allRows.filter((e) => rowMatchesLiveFilter(e, targetNorm))
    : allRows;
  /** 集約結果の liveId 表示に lid を使うか（フォールバック後は行ベース） */
  let useLidForOutput = filterByLive;
  if (filterByLive && rows.length === 0) {
    /*
     * 当 lv でまだ StoredComment が無い（視聴開始直後など）状態。
     * 空配列を返す代わりに全 live を集約して仮表示する合法フォールバックなので、
     * エンドユーザ向けには警告ではなく debug トレースに留める。
     * （以前は console.warn で黄色スタックを毎回出していた — UX 的にノイズ）
     */
    console.debug('[lane] filter matched 0, fallback all');
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
    // 0.1.79: viewer uid が broadcaster 本人でない場合、broadcaster icon と
    // 一致する URL は除外する（ギフト演出 DOM 観測の取り違え後方互換補正）。
    const isBroadcasterHere =
      broadcasterGuardEnabled && userId === broadcasterUid;
    for (const g of chronological) {
      if (/** @type {{ avatarObserved?: boolean }} */ (g).avatarObserved === true) {
        observed = true;
      }
      const u = String(/** @type {{ avatarUrl?: unknown }} */ (g).avatarUrl ?? '').trim();
      if (!u) continue;
      // 0.1.83: 普遍ルール — URL の埋め込み uid とエントリ uid の不一致は弾く
      //   broadcaster 情報が無くても効く最強のガード（過去の汚染データも全て掃除）
      if (!isAvatarUrlForUserId(u, userId)) continue;
      if (
        broadcasterGuardEnabled &&
        !isBroadcasterHere &&
        isSameAvatarUrl(u, broadcasterIconUrl)
      ) {
        continue;
      }
      urls.push(u);
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
