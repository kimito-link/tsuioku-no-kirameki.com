/**
 * v0.1.720 PR-T2: プロフィール解決の状態管理（純関数）。
 *
 * 従来の `_nicoProfileResolveAttempted` Set は、失敗した UID を永続的に
 * リトライ禁止にしていた。429（レート制限）や 5xx（一時障害）で失敗した
 * UID も二度と取得しない → サムネが出ないまま固定される根本原因。
 *
 * 本モジュールは UID ごとに「なぜ失敗したか」を記録し、HTTP ステータスに
 * 応じたリトライ判定を行う:
 *   - 200（成功）       → resolved（永続。24時間後に再取得可能）
 *   - 404/403/410       → permanent failure（負キャッシュ24時間）
 *   - 429              → transient（即座にリトライキューへ。最大2回）
 *   - 5xx / timeout    → transient（exponential backoff 1s→3s。最大2回）
 *   - null（SW無応答等） → transient（同上）
 *
 * 副作用なし。Map の代わりに plain object を使用（storage 互換）。
 */

/** @typedef {'pending'|'resolved'|'permanent_fail'|'transient_fail'} ResolveStatus */

/**
 * @typedef {object} ProfileResolveEntry
 * @property {ResolveStatus} status
 * @property {number} retryCount - これまでの再試行回数
 * @property {number} updatedAt - 最終更新時刻 (ms)
 * @property {number} nextRetryAt - 次のリトライ可能時刻 (ms)。0=即時OK
 * @property {number} [httpStatus] - 最後のHTTPステータス
 */

/**
 * @typedef {Record<string, ProfileResolveEntry>} ProfileResolveMap
 */

/** 一時的失敗の最大リトライ回数。 */
export const MAX_TRANSIENT_RETRY = 2;

/** 成功エントリの再取得可能間隔 (24時間)。 */
export const RESOLVED_RECHECK_MS = 24 * 60 * 60 * 1000;

/** 永続失敗の負キャッシュ期間 (24時間)。 */
export const PERMANENT_FAIL_TTL_MS = 24 * 60 * 60 * 1000;

/** 一時的失敗のバックオフ基底 (ms)。 */
export const TRANSIENT_BACKOFF_BASE_MS = 1000;

/**
 * HTTP ステータスから解決状態を決定する。
 *
 * @param {number|null|undefined} httpStatus
 * @returns {ResolveStatus}
 */
export function classifyHttpStatus(httpStatus) {
  if (httpStatus == null) return 'transient_fail';
  if (httpStatus >= 200 && httpStatus < 300) return 'resolved';
  if (httpStatus === 404 || httpStatus === 403 || httpStatus === 410) return 'permanent_fail';
  // 429 も transient（レート制限は一時的）
  return 'transient_fail';
}

/**
 * プロフィール取得結果を記録する。既存エントリがあれば更新、なければ新規作成。
 * 入力 map を変更しない（新しい map を返す）。
 *
 * @param {ProfileResolveMap} map - 既存の状態マップ
 * @param {string} uid - ユーザーID
 * @param {number|null|undefined} httpStatus - HTTP ステータスコード
 * @param {number} now - 現在時刻 (ms)
 * @returns {ProfileResolveMap} 更新後のマップ（新オブジェクト）
 */
export function recordProfileResult(map, uid, httpStatus, now) {
  if (!uid || typeof uid !== 'string') return map || {};
  const safe = map && typeof map === 'object' ? map : {};
  const prev = safe[uid];
  const status = classifyHttpStatus(httpStatus);

  /** @type {ProfileResolveEntry} */
  let entry;

  if (status === 'resolved') {
    entry = {
      status: 'resolved',
      retryCount: 0,
      updatedAt: now,
      nextRetryAt: now + RESOLVED_RECHECK_MS,
      httpStatus: httpStatus ?? undefined
    };
  } else if (status === 'permanent_fail') {
    entry = {
      status: 'permanent_fail',
      retryCount: (prev?.retryCount ?? 0) + 1,
      updatedAt: now,
      nextRetryAt: now + PERMANENT_FAIL_TTL_MS,
      httpStatus: httpStatus ?? undefined
    };
  } else {
    // transient_fail
    const prevRetry = prev?.retryCount ?? 0;
    const nextRetry = prevRetry + 1;
    // exponential backoff: 1s, 3s
    const backoffMs = TRANSIENT_BACKOFF_BASE_MS * Math.pow(2, prevRetry);
    entry = {
      status: 'transient_fail',
      retryCount: nextRetry,
      updatedAt: now,
      nextRetryAt: nextRetry > MAX_TRANSIENT_RETRY
        ? now + PERMANENT_FAIL_TTL_MS  // リトライ上限超え→永続待ち
        : now + backoffMs,
      httpStatus: httpStatus ?? undefined
    };
  }

  return { ...safe, [uid]: entry };
}

/**
 * 指定 UID がプロフィール取得を試行すべきかどうかを判定する。
 *
 * @param {ProfileResolveMap} map - 状態マップ
 * @param {string} uid - ユーザーID
 * @param {number} now - 現在時刻 (ms)
 * @returns {{ shouldResolve: boolean, reason: string }}
 */
export function shouldResolveProfile(map, uid, now) {
  if (!uid || typeof uid !== 'string') {
    return { shouldResolve: false, reason: 'invalid_uid' };
  }
  const safe = map && typeof map === 'object' ? map : {};
  const entry = safe[uid];

  // 未記録 → 初めて → 取得すべき
  if (!entry) {
    return { shouldResolve: true, reason: 'first_attempt' };
  }

  // resolved: 再取得可能時刻を過ぎていたら再取得
  if (entry.status === 'resolved') {
    if (now >= (entry.nextRetryAt || 0)) {
      return { shouldResolve: true, reason: 'resolved_expired' };
    }
    return { shouldResolve: false, reason: 'already_resolved' };
  }

  // permanent_fail: TTL 切れまでスキップ
  if (entry.status === 'permanent_fail') {
    if (now >= (entry.nextRetryAt || 0)) {
      return { shouldResolve: true, reason: 'permanent_fail_expired' };
    }
    return { shouldResolve: false, reason: 'permanent_fail' };
  }

  // transient_fail: リトライ上限未満 & バックオフ完了なら再試行
  if (entry.status === 'transient_fail') {
    if ((entry.retryCount || 0) > MAX_TRANSIENT_RETRY) {
      // リトライ上限超え。TTL 切れまで待つ
      if (now >= (entry.nextRetryAt || 0)) {
        return { shouldResolve: true, reason: 'retry_limit_expired' };
      }
      return { shouldResolve: false, reason: 'retry_limit_reached' };
    }
    if (now >= (entry.nextRetryAt || 0)) {
      return { shouldResolve: true, reason: 'backoff_complete' };
    }
    return { shouldResolve: false, reason: 'backoff_pending' };
  }

  // pending / unknown → 安全側で許可
  return { shouldResolve: true, reason: 'unknown_status' };
}

/**
 * 429 観測時にキュー全体を一時停止するための判定。
 *
 * @param {number|null|undefined} httpStatus
 * @returns {boolean}
 */
export function isRateLimitResponse(httpStatus) {
  return httpStatus === 429;
}

/**
 * 古いエントリを剪定する（メモリ節約）。24時間以上前に resolved/permanent_fail
 * になったエントリは除去可能（再取得すれば済む）。
 *
 * @param {ProfileResolveMap} map
 * @param {number} now
 * @param {number} [maxAge=86400000] - 剪定閾値 (ms)。既定24時間
 * @returns {ProfileResolveMap}
 */
export function pruneProfileResolveMap(map, now, maxAge = 24 * 60 * 60 * 1000) {
  if (!map || typeof map !== 'object') return {};
  /** @type {ProfileResolveMap} */
  const result = {};
  for (const [uid, entry] of Object.entries(map)) {
    if (!entry || typeof entry !== 'object') continue;
    const age = now - (entry.updatedAt || 0);
    // transient_fail は必ず残す（リトライカウントが重要）
    if (entry.status === 'transient_fail' || age < maxAge) {
      result[uid] = entry;
    }
  }
  return result;
}
