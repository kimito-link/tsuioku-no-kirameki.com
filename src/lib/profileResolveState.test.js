/**
 * v0.1.720 PR-T2: profileResolveState の単体テスト。
 *
 * テスト方針: 日本語平叙文 it 名・不変性検証・不正入力・境界値。
 */
import { describe, it, expect } from 'vitest';
import {
  classifyHttpStatus,
  recordProfileResult,
  shouldResolveProfile,
  isRateLimitResponse,
  pruneProfileResolveMap,
  MAX_TRANSIENT_RETRY,
  RESOLVED_RECHECK_MS,
  PERMANENT_FAIL_TTL_MS,
  TRANSIENT_BACKOFF_BASE_MS
} from './profileResolveState.js';

describe('classifyHttpStatus', () => {
  it('200は resolvedを返す', () => {
    expect(classifyHttpStatus(200)).toBe('resolved');
  });
  it('201も resolvedを返す', () => {
    expect(classifyHttpStatus(201)).toBe('resolved');
  });
  it('404は permanent_failを返す', () => {
    expect(classifyHttpStatus(404)).toBe('permanent_fail');
  });
  it('403は permanent_failを返す', () => {
    expect(classifyHttpStatus(403)).toBe('permanent_fail');
  });
  it('410は permanent_failを返す', () => {
    expect(classifyHttpStatus(410)).toBe('permanent_fail');
  });
  it('429は transient_failを返す', () => {
    expect(classifyHttpStatus(429)).toBe('transient_fail');
  });
  it('500は transient_failを返す', () => {
    expect(classifyHttpStatus(500)).toBe('transient_fail');
  });
  it('503は transient_failを返す', () => {
    expect(classifyHttpStatus(503)).toBe('transient_fail');
  });
  it('nullは transient_failを返す', () => {
    expect(classifyHttpStatus(null)).toBe('transient_fail');
  });
  it('undefinedは transient_failを返す', () => {
    expect(classifyHttpStatus(undefined)).toBe('transient_fail');
  });
});

describe('recordProfileResult', () => {
  const NOW = 1000000;

  it('200成功を記録するとresolved状態になる', () => {
    const map = recordProfileResult({}, '12345', 200, NOW);
    expect(map['12345'].status).toBe('resolved');
    expect(map['12345'].retryCount).toBe(0);
    expect(map['12345'].updatedAt).toBe(NOW);
    expect(map['12345'].nextRetryAt).toBe(NOW + RESOLVED_RECHECK_MS);
  });

  it('404を記録するとpermanent_fail状態になる', () => {
    const map = recordProfileResult({}, '12345', 404, NOW);
    expect(map['12345'].status).toBe('permanent_fail');
    expect(map['12345'].nextRetryAt).toBe(NOW + PERMANENT_FAIL_TTL_MS);
  });

  it('429を記録するとtransient_fail状態になる', () => {
    const map = recordProfileResult({}, '12345', 429, NOW);
    expect(map['12345'].status).toBe('transient_fail');
    expect(map['12345'].retryCount).toBe(1);
  });

  it('nullステータスをtransient_failとして記録する', () => {
    const map = recordProfileResult({}, '12345', null, NOW);
    expect(map['12345'].status).toBe('transient_fail');
  });

  it('入力mapを変更しない', () => {
    const original = {};
    const result = recordProfileResult(original, '12345', 200, NOW);
    expect(original).toEqual({});
    expect(result).not.toBe(original);
  });

  it('無効なuidでは元のmapを返す', () => {
    const map = { x: { status: 'resolved', retryCount: 0, updatedAt: 0, nextRetryAt: 0 } };
    expect(recordProfileResult(map, '', 200, NOW)).toBe(map);
    expect(recordProfileResult(map, null, 200, NOW)).toBe(map);
  });

  it('transient_failのバックオフが指数的に増える', () => {
    let map = recordProfileResult({}, '12345', 500, NOW);
    expect(map['12345'].nextRetryAt).toBe(NOW + TRANSIENT_BACKOFF_BASE_MS); // 1s

    map = recordProfileResult(map, '12345', 500, NOW + 2000);
    expect(map['12345'].retryCount).toBe(2);
    expect(map['12345'].nextRetryAt).toBe(NOW + 2000 + TRANSIENT_BACKOFF_BASE_MS * 2); // 2s
  });

  it('リトライ上限を超えると次回リトライが永続待ち期間になる', () => {
    let map = {};
    for (let i = 0; i <= MAX_TRANSIENT_RETRY; i++) {
      map = recordProfileResult(map, '12345', 500, NOW + i * 10000);
    }
    // MAX_TRANSIENT_RETRY + 1 回目 → retryCount > MAX_TRANSIENT_RETRY
    expect(map['12345'].retryCount).toBeGreaterThan(MAX_TRANSIENT_RETRY);
    expect(map['12345'].nextRetryAt).toBeGreaterThanOrEqual(NOW + PERMANENT_FAIL_TTL_MS - 10000);
  });

  it('mapがnullやundefinedでも安全に動作する', () => {
    expect(recordProfileResult(null, '12345', 200, NOW)['12345'].status).toBe('resolved');
    expect(recordProfileResult(undefined, '12345', 200, NOW)['12345'].status).toBe('resolved');
  });
});

describe('shouldResolveProfile', () => {
  const NOW = 1000000;

  it('未記録のuidは取得すべきと判定する', () => {
    const result = shouldResolveProfile({}, '12345', NOW);
    expect(result.shouldResolve).toBe(true);
    expect(result.reason).toBe('first_attempt');
  });

  it('resolved済みで期限内なら取得不要と判定する', () => {
    const map = recordProfileResult({}, '12345', 200, NOW);
    const result = shouldResolveProfile(map, '12345', NOW + 1000);
    expect(result.shouldResolve).toBe(false);
    expect(result.reason).toBe('already_resolved');
  });

  it('resolved済みで24時間経過したら再取得可能と判定する', () => {
    const map = recordProfileResult({}, '12345', 200, NOW);
    const result = shouldResolveProfile(map, '12345', NOW + RESOLVED_RECHECK_MS + 1);
    expect(result.shouldResolve).toBe(true);
    expect(result.reason).toBe('resolved_expired');
  });

  it('permanent_failで期限内ならスキップする', () => {
    const map = recordProfileResult({}, '12345', 404, NOW);
    const result = shouldResolveProfile(map, '12345', NOW + 1000);
    expect(result.shouldResolve).toBe(false);
    expect(result.reason).toBe('permanent_fail');
  });

  it('permanent_failで24時間経過したら再試行可能と判定する', () => {
    const map = recordProfileResult({}, '12345', 404, NOW);
    const result = shouldResolveProfile(map, '12345', NOW + PERMANENT_FAIL_TTL_MS + 1);
    expect(result.shouldResolve).toBe(true);
  });

  it('transient_failでバックオフ中ならスキップする', () => {
    const map = recordProfileResult({}, '12345', 429, NOW);
    const result = shouldResolveProfile(map, '12345', NOW + 100);
    expect(result.shouldResolve).toBe(false);
    expect(result.reason).toBe('backoff_pending');
  });

  it('transient_failでバックオフ完了なら再試行を許可する', () => {
    const map = recordProfileResult({}, '12345', 429, NOW);
    const result = shouldResolveProfile(map, '12345', NOW + TRANSIENT_BACKOFF_BASE_MS + 1);
    expect(result.shouldResolve).toBe(true);
    expect(result.reason).toBe('backoff_complete');
  });

  it('リトライ上限超えでTTL内ならスキップする', () => {
    let map = {};
    for (let i = 0; i <= MAX_TRANSIENT_RETRY; i++) {
      map = recordProfileResult(map, '12345', 500, NOW + i * 10000);
    }
    const result = shouldResolveProfile(map, '12345', NOW + 50000);
    expect(result.shouldResolve).toBe(false);
    expect(result.reason).toBe('retry_limit_reached');
  });

  it('無効なuidはshouldResolve=falseを返す', () => {
    expect(shouldResolveProfile({}, '', NOW).shouldResolve).toBe(false);
    expect(shouldResolveProfile({}, null, NOW).shouldResolve).toBe(false);
  });

  it('nullマップでも安全に動作する', () => {
    expect(shouldResolveProfile(null, '12345', NOW).shouldResolve).toBe(true);
  });
});

describe('isRateLimitResponse', () => {
  it('429はtrueを返す', () => {
    expect(isRateLimitResponse(429)).toBe(true);
  });
  it('200はfalseを返す', () => {
    expect(isRateLimitResponse(200)).toBe(false);
  });
  it('500はfalseを返す', () => {
    expect(isRateLimitResponse(500)).toBe(false);
  });
  it('nullはfalseを返す', () => {
    expect(isRateLimitResponse(null)).toBe(false);
  });
});

describe('pruneProfileResolveMap', () => {
  const NOW = 1000000;
  const OLD = NOW - 25 * 60 * 60 * 1000; // 25時間前

  it('古いresolvedエントリを除去する', () => {
    const map = {
      old: { status: 'resolved', retryCount: 0, updatedAt: OLD, nextRetryAt: 0 },
      fresh: { status: 'resolved', retryCount: 0, updatedAt: NOW - 1000, nextRetryAt: 0 }
    };
    const pruned = pruneProfileResolveMap(map, NOW);
    expect(pruned).not.toHaveProperty('old');
    expect(pruned).toHaveProperty('fresh');
  });

  it('transient_failは古くても残す', () => {
    const map = {
      retry: { status: 'transient_fail', retryCount: 1, updatedAt: OLD, nextRetryAt: NOW + 1000 }
    };
    const pruned = pruneProfileResolveMap(map, NOW);
    expect(pruned).toHaveProperty('retry');
  });

  it('nullマップでも安全に空オブジェクトを返す', () => {
    expect(pruneProfileResolveMap(null, NOW)).toEqual({});
  });
});
