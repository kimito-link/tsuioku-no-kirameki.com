import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  acquireGlobalFetchToken,
  reportGlobalFetchResult,
  resetGlobalFetchLimiterForTest,
  STORAGE_KEY,
  MIN_RATE,
  RATE_UP_SUCCESS_COUNT
} from './globalFetchRateLimiter.js';

/**
 * chrome.storage.session のモックを globalThis に立てる。
 * @param {{ throwOnAccess?: boolean }} [opts]
 *   throwOnAccess: content script で setAccessLevel 未設定のときの
 *   「Access to storage is not allowed from this context.」を再現する。
 */
function installChromeMock(opts = {}) {
  const store = new Map();
  const calls = { get: 0, set: 0 };
  /** @type {any} */ (globalThis).chrome = {
    storage: {
      session: {
        async get(key) {
          calls.get += 1;
          if (opts.throwOnAccess) {
            throw new Error('Access to storage is not allowed from this context.');
          }
          return { [key]: store.get(key) };
        },
        async set(obj) {
          calls.set += 1;
          if (opts.throwOnAccess) {
            throw new Error('Access to storage is not allowed from this context.');
          }
          for (const [k, v] of Object.entries(obj)) store.set(k, v);
        }
      }
    }
  };
  return { store, calls };
}

afterEach(() => {
  delete (/** @type {any} */ (globalThis).chrome);
  resetGlobalFetchLimiterForTest();
  vi.useRealTimers();
});

describe('globalFetchRateLimiter', () => {
  it('chrome が無い環境では fail-open で即 return する', async () => {
    await expect(acquireGlobalFetchToken()).resolves.toBeUndefined();
    await expect(reportGlobalFetchResult(true, false)).resolves.toBeUndefined();
  });

  it('初回 acquire でバケツが作られトークンが1消費されて保存される', async () => {
    const { store } = installChromeMock();
    await acquireGlobalFetchToken();
    const state = store.get(STORAGE_KEY);
    expect(state).toBeTruthy();
    expect(state.currentRate).toBe(MIN_RATE);
    // capacity=MIN_RATE(=1) から 1 消費済み
    expect(state.bucket.tokens).toBe(0);
  });

  it('トークン切れのときは補充されるまで待ってから取得する', async () => {
    vi.useFakeTimers();
    installChromeMock();
    await acquireGlobalFetchToken(); // capacity 1 を使い切る
    let resolved = false;
    const p = acquireGlobalFetchToken().then(() => {
      resolved = true;
    });
    // まだ補充されていない(レート 1/sec なので 1 秒待ち)
    await vi.advanceTimersByTimeAsync(300);
    expect(resolved).toBe(false);
    // 1 秒分進めれば 1 トークン補充されて取得できる
    await vi.advanceTimersByTimeAsync(1200);
    await p;
    expect(resolved).toBe(true);
  });

  it('aborted な signal では即座に throw する', async () => {
    installChromeMock();
    const ac = new AbortController();
    ac.abort();
    await expect(acquireGlobalFetchToken(ac.signal)).rejects.toThrow('aborted');
  });

  it('storage アクセスが例外を投げる環境(setAccessLevel 未設定)では fail-open し、以後ストレージに触らない', async () => {
    const { calls } = installChromeMock({ throwOnAccess: true });
    // 1回目: 例外を検知して素通し(throw しない=backfill を壊さない)
    await expect(acquireGlobalFetchToken()).resolves.toBeUndefined();
    const getCallsAfterFirst = calls.get;
    expect(getCallsAfterFirst).toBeGreaterThan(0);
    // 2回目以降: 休眠フラグによりストレージを触らず即 return
    await expect(acquireGlobalFetchToken()).resolves.toBeUndefined();
    await expect(reportGlobalFetchResult(true, false)).resolves.toBeUndefined();
    expect(calls.get).toBe(getCallsAfterFirst);
  });

  it('429 を観測したらレートを MIN_RATE へ即降格する', async () => {
    const { store } = installChromeMock();
    store.set(STORAGE_KEY, {
      bucket: { capacity: 3, refillPerSec: 3, tokens: 3, lastRefillMs: Date.now() },
      successCount: 5,
      currentRate: 3
    });
    await reportGlobalFetchResult(false, true);
    const state = store.get(STORAGE_KEY);
    expect(state.currentRate).toBe(MIN_RATE);
    expect(state.successCount).toBe(0);
    expect(state.bucket.refillPerSec).toBe(MIN_RATE);
  });

  it('成功が RATE_UP_SUCCESS_COUNT 回続いたらレートを 1 段上げる', async () => {
    const { store } = installChromeMock();
    store.set(STORAGE_KEY, {
      bucket: { capacity: 1, refillPerSec: 1, tokens: 1, lastRefillMs: Date.now() },
      successCount: RATE_UP_SUCCESS_COUNT - 1,
      currentRate: 1
    });
    await reportGlobalFetchResult(true, false);
    const state = store.get(STORAGE_KEY);
    expect(state.currentRate).toBe(2);
    expect(state.successCount).toBe(0);
    expect(state.bucket.refillPerSec).toBe(2);
  });

  it('state が無いときの report は何もしない(エラーにならない)', async () => {
    const { store } = installChromeMock();
    await expect(reportGlobalFetchResult(true, false)).resolves.toBeUndefined();
    expect(store.has(STORAGE_KEY)).toBe(false);
  });
});
