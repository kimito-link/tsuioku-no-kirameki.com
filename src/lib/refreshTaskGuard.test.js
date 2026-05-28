import { describe, it, expect, beforeEach, vi } from 'vitest';
import { refreshTaskGuarded } from './refreshTaskGuard.js';

describe('refreshTaskGuarded（refresh() の永久 pending を有界化する薄いガード・v0.1.437）', () => {
  beforeEach(() => {
    // 前テストの globalThis 副作用を掃除（独立性確保）。
    try {
      delete /** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask;
    } catch {
      /* no-op */
    }
  });

  it('解決済みの Promise はそのまま値が返る（fast path 不変）', async () => {
    const r = await refreshTaskGuarded(Promise.resolve({ ok: true, n: 7 }), 5_000, 'never', { ok: false });
    expect(r).toEqual({ ok: true, n: 7 });
  });

  it('永久 pending なら ms 経過後に fallback が返り、診断面に taskCode が残る', async () => {
    /** @type {Promise<string>} */
    const hang = new Promise(() => {}); // 永遠に settle しない
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await refreshTaskGuarded(hang, 10, 'refresh_test_timeout', 'fallback-value');
    expect(r).toBe('fallback-value');
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBe(
      'refresh_test_timeout'
    );
    // console.warn が 1 回呼ばれた（診断ログ）
    expect(warnSpy).toHaveBeenCalledWith('[nl-refresh-timeout] refresh_test_timeout');
    warnSpy.mockRestore();
  });

  it('元の Promise が別理由で reject しても fallback を返し、診断面には残さない（refresh 続行優先）', async () => {
    const failing = Promise.reject(new Error('network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await refreshTaskGuarded(failing, 1_000, 'refresh_test_2', { default: true });
    expect(r).toEqual({ default: true });
    // 別エラー（taskCode と一致しない）なので診断面は更新されない
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBeUndefined();
    // 別エラーで warn は出さない（refresh の冗長ログを増やさない）
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ms より早く解決すれば setTimeout はクリアされ、診断面も更新されない', async () => {
    const fast = new Promise((resolve) => setTimeout(() => resolve('ok'), 1));
    const r = await refreshTaskGuarded(fast, 5_000, 'should_not_fire', null);
    expect(r).toBe('ok');
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBeUndefined();
  });

  it('複数タスクが順次タイムアウトしても、診断面は最後のタスク名で上書きされる', async () => {
    /** @type {Promise<unknown>} */
    const hang1 = new Promise(() => {});
    /** @type {Promise<unknown>} */
    const hang2 = new Promise(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await refreshTaskGuarded(hang1, 5, 'task_A', null);
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBe('task_A');
    await refreshTaskGuarded(hang2, 5, 'task_B', null);
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBe('task_B');
    warnSpy.mockRestore();
  });

  it('fallback として undefined を渡せば undefined が返る（型シグネチャの自由度）', async () => {
    /** @type {Promise<unknown>} */
    const hang = new Promise(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await refreshTaskGuarded(hang, 5, 'task_undef', undefined);
    expect(r).toBeUndefined();
    warnSpy.mockRestore();
  });
});
