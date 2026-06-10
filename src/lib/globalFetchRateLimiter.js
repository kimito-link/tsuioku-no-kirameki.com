import { createTokenBucket, tryTakeToken } from './tokenBucket.js';

/**
 * v0.1.664 PR4: tokenBucket.js を用いた全タブ横断の fetch レートリミッター(土台)。
 * chrome.storage.session を介してトークンバケツを共有し、複数タブでの
 * NDGR backfill リクエストを全体で制御する。
 *
 * - 初期レートは安全な 1 req/sec(単一タブ相当)。
 * - 成功が続けば最大 6 req/sec まで自動で引き上げる。
 * - 429(Too Many Requests)を観測したら即座に 1 req/sec へ落とす。
 *
 * ⚠️ 現状は【休眠】(常に fail-open で素通し):
 *   content script から chrome.storage.session を使うには、信頼コンテキスト(SW 等)で
 *   `chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_AND_UNTRUSTED_CONTEXTS'})`
 *   を呼んでおく必要があり、未設定だと get/set が例外を投げる。本モジュールは例外を
 *   検知したら以後ストレージに触らず素通しする(backfill を絶対に壊さない fail-open 原則)。
 *   将来有効化するときは ①SW で setAccessLevel を配線 ②MIN/MAX レートを実測流量に
 *   合わせて見直すこと(単一タブの一気取りは実測 数十req/sec。1〜6 req/sec のままで
 *   有効化すると「一気に取れる」(v0.1.642〜663 の根治)を殺す退行になる)。
 *
 * 厳密なアトミック操作(CAS)がないため多少の競合で超過する可能性はあるが、
 * 429 を防ぐ(soft rate-limiting)目的としては十分機能する。
 */

export const STORAGE_KEY = 'nls_backfill_bucket_v1';
export const MIN_RATE = 1;
export const MAX_RATE = 6;
export const RATE_UP_SUCCESS_COUNT = 10; // 10回連続成功でレート+1

/**
 * @typedef {object} GlobalRateState
 * @property {import('./tokenBucket.js').TokenBucketState} bucket
 * @property {number} successCount
 * @property {number} currentRate
 */

/**
 * storage.session が例外を投げた(=アクセスレベル未設定等)ことを記憶し、
 * 以後のフェッチで毎回例外を踏まないようにするフラグ。
 * @type {boolean}
 */
let _sessionStorageUnavailable = false;

/**
 * テスト用: 休眠フラグをリセットする(モジュール状態がテスト間で漏れないように)。
 */
export function resetGlobalFetchLimiterForTest() {
  _sessionStorageUnavailable = false;
}

/**
 * 使える chrome.storage.session を返す。無い/壊れている環境では null(fail-open)。
 * @returns {{ get: Function, set: Function } | null}
 */
function sessionStorageOrNull() {
  if (_sessionStorageUnavailable) return null;
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) {
    return null;
  }
  return chrome.storage.session;
}

/**
 * トークンを取得できるまで(または abort されるまで)待機する。
 * storage が使えない環境では何もせず即 return(fail-open=従来動作)。
 * @param {AbortSignal} [signal]
 */
export async function acquireGlobalFetchToken(signal) {
  for (;;) {
    if (signal?.aborted) {
      throw new Error('aborted');
    }

    const session = sessionStorageOrNull();
    if (!session) return;

    /** @type {GlobalRateState | undefined} */
    let state;
    try {
      const st = await session.get(STORAGE_KEY);
      state = st ? st[STORAGE_KEY] : undefined;
    } catch {
      // setAccessLevel 未設定の content script 等。以後は素通し(backfill を壊さない)。
      _sessionStorageUnavailable = true;
      return;
    }

    const now = Date.now();
    if (!state || !state.bucket) {
      state = {
        bucket: createTokenBucket(MIN_RATE, MIN_RATE, now),
        successCount: 0,
        currentRate: MIN_RATE
      };
    }

    const res = tryTakeToken(state.bucket, now, 1);
    if (res.allowed) {
      state.bucket = res.state;
      // 取得後、直ちにストレージへ書き戻す(ベストエフォート)
      try {
        await session.set({ [STORAGE_KEY]: state });
      } catch {
        _sessionStorageUnavailable = true;
      }
      return;
    }
    // 足りない場合は待つ。最長 500ms 単位でポーリングして Abort 検知しやすくする。
    const wait = Math.max(10, Math.min(res.waitMs, 500));
    await new Promise((r) => setTimeout(r, wait));
  }
}

/**
 * fetch の結果をフィードバックし、必要ならレートを上下させる。
 * storage が使えない環境では何もしない(fail-open)。
 * @param {boolean} isSuccess
 * @param {boolean} is429
 */
export async function reportGlobalFetchResult(isSuccess, is429) {
  const session = sessionStorageOrNull();
  if (!session) return;

  /** @type {GlobalRateState | undefined} */
  let state;
  try {
    const st = await session.get(STORAGE_KEY);
    state = st ? st[STORAGE_KEY] : undefined;
  } catch {
    _sessionStorageUnavailable = true;
    return;
  }
  if (!state || !state.bucket) return;

  const now = Date.now();
  let changed = false;

  if (is429) {
    // 429 なら直ちに最低レートへ降格
    if (state.currentRate > MIN_RATE) {
      state.currentRate = MIN_RATE;
      state.successCount = 0;
      state.bucket.capacity = MIN_RATE;
      state.bucket.refillPerSec = MIN_RATE;
      state.bucket.lastRefillMs = now; // レート変更時に現在時刻へリセット
      changed = true;
    }
  } else if (isSuccess) {
    state.successCount = (state.successCount || 0) + 1;
    if (state.successCount >= RATE_UP_SUCCESS_COUNT) {
      state.successCount = 0;
      if (state.currentRate < MAX_RATE) {
        state.currentRate += 1;
        state.bucket.capacity = state.currentRate;
        state.bucket.refillPerSec = state.currentRate;
        state.bucket.lastRefillMs = now;
        changed = true;
      }
    } else {
      // レートアップしなくても成功カウントだけ更新
      changed = true;
    }
  }

  if (changed) {
    try {
      await session.set({ [STORAGE_KEY]: state });
    } catch {
      _sessionStorageUnavailable = true;
    }
  }
}
