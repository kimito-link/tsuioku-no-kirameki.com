/**
 * 応援ユーザーレーン用: nls_comments 相当の StoredComment 配列から userId 単位に集約した候補。
 *
 * 第2引数 liveId を省略（または null / 空文字）のときは liveId で絞り込まず集約する（契約 I6）。
 * popup からは当放送の lvId を渡し、別放送の行を混ぜない。
 */

import { normalizeLv as normalizeLvCanonical } from '../shared/niconico/liveId.js';
import { pickStrongestAvatarUrlForUser } from './supportGrowthTileSrc.js';
import { isSameAvatarUrl } from './avatarUrlCompare.js';
import { isAvatarUrlForUserId } from './avatarBroadcasterGuard.js';
import {
  pickBetterInterceptNickname,
  pickGiftRankDisplayNicknameWithUidFallback
} from './giftDisplayNickname.js';
import { isAvatarObservedInCommentProfileMap } from './popupAvatarResolver.js';

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
 * @param {{ broadcasterUid?: string, broadcasterIconUrl?: string, requireText?: boolean }} [opts]
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
  const requireText = opts?.requireText === true;

  const allRows = Array.isArray(storedComments) ? storedComments : [];
  let rows = filterByLive
    ? allRows.filter((e) => rowMatchesLiveFilter(e, targetNorm))
    : allRows;
  if (requireText) {
    rows = rows.filter((e) =>
      Boolean(String(/** @type {{ text?: unknown }} */ (e)?.text ?? '').trim())
    );
  }
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
    rows = requireText
      ? allRows.filter((e) =>
          Boolean(String(/** @type {{ text?: unknown }} */ (e)?.text ?? '').trim())
        )
      : allRows;
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
    for (const g of chronological) {
      const n = String(/** @type {{ nickname?: unknown }} */ (g).nickname ?? '').trim();
      if (!n) continue;
      nickname = pickBetterInterceptNickname(userId, nickname, n);
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

/**
 * ストレージ集約の nickname を、表示リスト（プロファイル適用済みのコメント行）と
 * `KEY_USER_COMMENT_PROFILE_CACHE`（intercept / join 由来）で補強する。
 * ギフト帯の {@link pickGiftRankDisplayNickname} と同系の優先ルールで揃える。
 *
 * F3(v0.1.282): nickname 補強に加え、プロファイルキャッシュに「intercept 由来の
 * 実 avatar URL」が観測できているユーザーは `avatarObserved` も true へ昇格する
 * （加法のみ — 既存 true は不変、合成 canonical URL は
 * `isAvatarObservedInCommentProfileMap` が弾くので退会/未設定を誤観測しない）。
 * これにより弱ニック＋数値IDでも実 avatar 観測があれば link 段へ正しく上がる。
 *
 * @param {readonly Readonly<UserLaneCandidateFromStorage>[]} aggregates
 * @param {readonly unknown[]|null|undefined} displayEntries
 * @param {Record<string, { nickname?: unknown, avatarUrl?: unknown }>|null|undefined} profileMap
 * @returns {readonly Readonly<UserLaneCandidateFromStorage>[]}
 */
export function enrichUserLaneAggregatesWithProfileAndDisplay(
  aggregates,
  displayEntries,
  profileMap
) {
  if (!Array.isArray(aggregates) || aggregates.length === 0) {
    return Array.isArray(aggregates)
      ? /** @type {readonly Readonly<UserLaneCandidateFromStorage>[]} */ (aggregates)
      : Object.freeze([]);
  }
  const entries = Array.isArray(displayEntries) ? displayEntries : [];
  const map =
    profileMap && typeof profileMap === 'object' && !Array.isArray(profileMap)
      ? profileMap
      : /** @type {Record<string, { nickname?: unknown, avatarUrl?: unknown }>} */ ({});

  /**
   * @param {string} uid
   * @returns {string}
   */
  function bestNicknameFromEntries(uid) {
    const id = String(uid || '').trim();
    if (!id || !entries.length) return '';
    /** @type {unknown[]} */
    const hits = [];
    for (const e of entries) {
      if (String(/** @type {{ userId?: unknown }} */ (e)?.userId ?? '').trim() !== id) {
        continue;
      }
      hits.push(e);
    }
    if (!hits.length) return '';
    hits.sort((a, b) => rowCapturedAt(a) - rowCapturedAt(b));
    let nick = '';
    for (const e of hits) {
      const n = String(/** @type {{ nickname?: unknown }} */ (e)?.nickname ?? '').trim();
      if (!n) continue;
      nick = pickBetterInterceptNickname(id, nick, n);
    }
    return nick;
  }

  let anyChange = false;
  const built = aggregates.map((agg) => {
    const uid = String(agg.userId || '').trim();
    const stored = String(agg.nickname || '').trim();
    const intercept = String(
      /** @type {{ nickname?: unknown }} */ (map[uid])?.nickname ?? ''
    ).trim();
    const fromDisplay = bestNicknameFromEntries(uid);
    // 0.1.182: nickname が解決できないケース（avatarNicknameMatchDiag.avNoNick）で
    // 匿名表示にせず、`u/<uid>` フォールバック表示を使う（v0.1.181 で追加した
    // formatNicknameWithUidFallback 経由）。
    const merged = pickGiftRankDisplayNicknameWithUidFallback(
      uid,
      stored,
      fromDisplay,
      intercept
    );
    // F3(v0.1.282): プロファイルキャッシュに実 avatar 観測があれば observed
    // 昇格。加法のみ（既存 true は不変、合成 canonical は弾かれる）。
    const observedNext =
      Boolean(agg.avatarObserved) ||
      isAvatarObservedInCommentProfileMap(uid, map);
    const nickChanged = merged !== stored;
    const observedChanged = observedNext !== Boolean(agg.avatarObserved);
    if (!nickChanged && !observedChanged) return agg;
    anyChange = true;
    return Object.freeze({
      userId: agg.userId,
      nickname: nickChanged ? merged : agg.nickname,
      avatarUrl: agg.avatarUrl,
      avatarObserved: observedNext,
      liveId: agg.liveId
    });
  });

  if (!anyChange) return aggregates;
  return /** @type {readonly Readonly<UserLaneCandidateFromStorage>[]} */ (
    Object.freeze(built)
  );
}
