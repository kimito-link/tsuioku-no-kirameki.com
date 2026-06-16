import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createCommentSubmitProfiler,
  NLS_COMMENT_SUBMIT_PROFILE_FLAG,
  NLS_COMMENT_SUBMIT_LAST_TIMINGS,
  NLS_COMMENT_SUBMIT_HISTORY_KEY,
  NLS_COMMENT_SUBMIT_HISTORY_MAX,
  NLS_COMMENT_SUBMIT_SLOW_WARN_MS,
  isCommentSubmitProfileEnabled,
  recordCommentSubmitTotal
} from './commentSubmitProfiling.js';

describe('commentSubmitProfiling', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_PROFILE_FLAG);
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_LAST_TIMINGS);
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_HISTORY_KEY);
  });

  it('フラグ OFF なら create は null', () => {
    expect(isCommentSubmitProfileEnabled()).toBe(false);
    expect(createCommentSubmitProfiler({ now: () => 0 })).toBeNull();
  });

  it('フラグ ON なら mark/finish が記録する', () => {
    globalThis[NLS_COMMENT_SUBMIT_PROFILE_FLAG] = true;
    let t = 0;
    const prof = createCommentSubmitProfiler({ now: () => (t += 10) });
    expect(prof).not.toBeNull();
    prof.mark('a');
    prof.mark('b');
    prof.finish('x');
    expect(globalThis[NLS_COMMENT_SUBMIT_LAST_TIMINGS]).toEqual([
      ['a', 10],
      ['b', 20]
    ]);
  });
});

describe('recordCommentSubmitTotal', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_HISTORY_KEY);
    vi.restoreAllMocks();
  });

  it('総所要を rolling buffer に積む', () => {
    recordCommentSubmitTotal('nls-cmt-popup', 120);
    recordCommentSubmitTotal('nls-cmt-popup', 200);
    const buf = /** @type {any[]} */ (globalThis[NLS_COMMENT_SUBMIT_HISTORY_KEY]);
    expect(Array.isArray(buf)).toBe(true);
    expect(buf.length).toBe(2);
    expect(buf[0].label).toBe('nls-cmt-popup');
    expect(buf[0].ms).toBe(120);
    expect(buf[1].ms).toBe(200);
  });

  it(`buffer は ${NLS_COMMENT_SUBMIT_HISTORY_MAX} 件で頭から落ちる`, () => {
    for (let i = 0; i < NLS_COMMENT_SUBMIT_HISTORY_MAX + 3; i++) {
      recordCommentSubmitTotal('nls-cmt-popup', i);
    }
    const buf = /** @type {any[]} */ (globalThis[NLS_COMMENT_SUBMIT_HISTORY_KEY]);
    expect(buf.length).toBe(NLS_COMMENT_SUBMIT_HISTORY_MAX);
    expect(buf[0].ms).toBe(3); // 0,1,2 が落ちて 3 から残る
  });

  it(`${NLS_COMMENT_SUBMIT_SLOW_WARN_MS}ms 以上なら console.debug が出る(拡張エラー欄には出さない)`, () => {
    // v0.1.776: chrome://extensions のエラー欄を汚さないよう warn ではなく debug に下げた。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    recordCommentSubmitTotal('nls-cmt-popup', NLS_COMMENT_SUBMIT_SLOW_WARN_MS);
    expect(warn).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0][0])).toMatch(/slow=\d+ms/);
  });

  it('閾値未満なら debug も warn も出ない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    recordCommentSubmitTotal('nls-cmt-popup', NLS_COMMENT_SUBMIT_SLOW_WARN_MS - 1);
    expect(warn).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });

  it('不正な値は無視（負数・NaN）', () => {
    recordCommentSubmitTotal('x', -1);
    recordCommentSubmitTotal('x', Number.NaN);
    expect(globalThis[NLS_COMMENT_SUBMIT_HISTORY_KEY]).toBeUndefined();
  });
});
