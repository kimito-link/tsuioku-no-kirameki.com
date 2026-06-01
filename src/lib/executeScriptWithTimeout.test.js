import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeScriptWithTimeout } from './executeScriptWithTimeout.js';

describe('executeScriptWithTimeout（chrome.scripting.executeScript 永久 pending を有界化・v0.1.441）', () => {
  beforeEach(() => {
    try {
      delete /** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask;
    } catch {
      /* no-op */
    }
  });

  it('executor が即時 resolve すれば結果がそのまま返る（fast path 不変）', async () => {
    const r = await executeScriptWithTimeout(
      () => Promise.resolve([{ result: { score: 1 } }]),
      5_000,
      'never',
      []
    );
    expect(r).toEqual([{ result: { score: 1 } }]);
  });

  it('executor が永久 pending なら ms 経過後に fallback、診断面に taskCode が残る', async () => {
    const hang = () => new Promise(() => {}); // 永遠に settle しない
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const r = await executeScriptWithTimeout(hang, 10, 'list_watch_frames_executescript_timeout', []);
    expect(r).toEqual([]);
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBe(
      'list_watch_frames_executescript_timeout'
    );
    expect(debugSpy).toHaveBeenCalledWith('[nl-refresh-timeout] list_watch_frames_executescript_timeout');
    debugSpy.mockRestore();
  });

  it('executor が別理由で reject しても fallback を返し、診断面には残さない', async () => {
    const failing = () => Promise.reject(new Error('chrome api unavailable'));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const r = await executeScriptWithTimeout(failing, 1_000, 'x_timeout', null);
    expect(r).toBeNull();
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBeUndefined();
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('executor は 1 回だけ呼ばれる（race の重複呼び出しを起こさない）', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    await executeScriptWithTimeout(fn, 1_000, 'x', null);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ms より早く resolve すれば setTimeout は片付けられる（リソースリーク無し）', async () => {
    const fast = () => new Promise((r) => setTimeout(() => r('done'), 1));
    const result = await executeScriptWithTimeout(fast, 5_000, 'never_fires', null);
    expect(result).toBe('done');
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBeUndefined();
  });

  it('fallback として undefined / 空配列 / null など型違いを受け取れる', async () => {
    const hang = () => new Promise(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(await executeScriptWithTimeout(hang, 5, 't1', [])).toEqual([]);
    expect(await executeScriptWithTimeout(hang, 5, 't2', null)).toBeNull();
    expect(await executeScriptWithTimeout(hang, 5, 't3', undefined)).toBeUndefined();
    debugSpy.mockRestore();
  });

  it('連続タイムアウト時、診断面は最後の taskCode で上書きされる', async () => {
    const hang = () => new Promise(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await executeScriptWithTimeout(hang, 5, 'task_A', []);
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBe('task_A');
    await executeScriptWithTimeout(hang, 5, 'task_B', []);
    expect(/** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask).toBe('task_B');
    debugSpy.mockRestore();
  });
});
