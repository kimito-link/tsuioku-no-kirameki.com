import { describe, it, expect, vi } from 'vitest';
import { createPopupDiagAutoPublisher, resolvePopupWatchUrl } from './popupDiagAutoPublish.js';

describe('createPopupDiagAutoPublisher', () => {
  it('初回 schedule でアイドルに collect を予約し、collect は1回だけ走る', async () => {
    const collect = vi.fn(() => Promise.resolve());
    /** @type {Array<() => void>} */
    const idleQueue = [];
    const schedule = createPopupDiagAutoPublisher(collect, {
      requestIdle: (cb) => { idleQueue.push(cb); },
      setTimeoutFn: () => { throw new Error('setTimeout は requestIdle がある時は使わない'); }
    });
    schedule();
    schedule(); // 2回目は無視されるべき
    schedule();
    expect(idleQueue.length).toBe(1); // 予約は1回だけ
    idleQueue[0](); // アイドル発火
    await Promise.resolve();
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('requestIdle が無ければ setTimeout フォールバックで予約する', () => {
    const collect = vi.fn(() => Promise.resolve());
    let scheduledMs = -1;
    const schedule = createPopupDiagAutoPublisher(collect, {
      requestIdle: null,
      setTimeoutFn: (_cb, ms) => { scheduledMs = ms; },
      fallbackDelayMs: 1500
    });
    schedule();
    expect(scheduledMs).toBe(1500);
  });

  it('collect が reject しても schedule は throw しない(自動集約失敗は無視)', async () => {
    const collect = vi.fn(() => Promise.reject(new Error('boom')));
    /** @type {Array<() => void>} */
    const idleQueue = [];
    const schedule = createPopupDiagAutoPublisher(collect, {
      requestIdle: (cb) => { idleQueue.push(cb); }
    });
    expect(() => schedule()).not.toThrow();
    expect(() => idleQueue[0]()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(collect).toHaveBeenCalledTimes(1);
  });
});

describe('resolvePopupWatchUrl', () => {
  it('dataset の watchUrl があればそれを trim して返す(storage は読まない)', async () => {
    const readLastWatchUrl = vi.fn();
    const url = await resolvePopupWatchUrl({
      datasetWatchUrl: '  https://live.nicovideo.jp/watch/lv1  ',
      readLastWatchUrl
    });
    expect(url).toBe('https://live.nicovideo.jp/watch/lv1');
    expect(readLastWatchUrl).not.toHaveBeenCalled();
  });

  it('dataset が空なら readLastWatchUrl にフォールバックする', async () => {
    const url = await resolvePopupWatchUrl({
      datasetWatchUrl: '',
      readLastWatchUrl: async () => 'https://live.nicovideo.jp/watch/lv2'
    });
    expect(url).toBe('https://live.nicovideo.jp/watch/lv2');
  });

  it('readLastWatchUrl が throw しても空文字を返す(fail-open)', async () => {
    const url = await resolvePopupWatchUrl({
      datasetWatchUrl: '',
      readLastWatchUrl: async () => { throw new Error('storage error'); }
    });
    expect(url).toBe('');
  });

  it('どちらも無ければ空文字', async () => {
    expect(await resolvePopupWatchUrl({})).toBe('');
  });
});
