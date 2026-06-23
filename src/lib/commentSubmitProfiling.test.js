import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createCommentSubmitProfiler,
  NLS_COMMENT_SUBMIT_PROFILE_FLAG,
  NLS_COMMENT_SUBMIT_LAST_TIMINGS,
  NLS_COMMENT_SUBMIT_HISTORY_KEY,
  NLS_COMMENT_SUBMIT_HISTORY_MAX,
  NLS_COMMENT_SUBMIT_SLOW_WARN_MS,
  NLS_COMMENT_SUBMIT_OUTCOME_KEY,
  NLS_COMMENT_SUBMIT_FAIL_REASONS_MAX,
  isCommentSubmitProfileEnabled,
  recordCommentSubmitTotal,
  classifyCommentSubmitError,
  recordCommentSubmitOutcome,
  summarizeCommentSubmitDiag
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

describe('classifyCommentSubmitError', () => {
  it('ok=true は ok', () => {
    expect(classifyCommentSubmitError(true, '')).toBe('ok');
  });

  it('各失敗文言を errorCode に分類する', () => {
    expect(classifyCommentSubmitError(false, 'コメントが空です。')).toBe('empty');
    expect(
      classifyCommentSubmitError(false, 'コメント欄のあるwatchフレームが見つかりません。')
    ).toBe('no_frame');
    expect(
      classifyCommentSubmitError(false, 'コメント入力欄が見つかりません。数秒待って…')
    ).toBe('no_editor');
    expect(
      classifyCommentSubmitError(false, '公式の送信ボタンを見つけられませんでした。')
    ).toBe('no_button');
    expect(
      classifyCommentSubmitError(false, 'コメント送信を確認できませんでした。')
    ).toBe('unconfirmed');
  });

  it('英字コード（例外経路）は exception', () => {
    expect(classifyCommentSubmitError(false, 'post_failed')).toBe('exception');
  });

  it('空・未知は unknown', () => {
    expect(classifyCommentSubmitError(false, '')).toBe('unknown');
    expect(classifyCommentSubmitError(false, null)).toBe('unknown');
    expect(classifyCommentSubmitError(false, '予期しない日本語エラー')).toBe('unknown');
  });
});

describe('recordCommentSubmitOutcome + summarizeCommentSubmitDiag', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_OUTCOME_KEY);
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_HISTORY_KEY);
  });

  it('集計が無ければ summarize は null', () => {
    expect(summarizeCommentSubmitDiag()).toBeNull();
  });

  it('成功/失敗数・成功率・直近の失敗理由を集計する', () => {
    recordCommentSubmitOutcome(true);
    recordCommentSubmitOutcome(true);
    recordCommentSubmitOutcome(false, 'コメント送信を確認できませんでした。');
    const acc = /** @type {any} */ (globalThis[NLS_COMMENT_SUBMIT_OUTCOME_KEY]);
    expect(acc.total).toBe(3);
    expect(acc.ok).toBe(2);
    expect(acc.fail).toBe(1);
    expect(acc.recentFails).toEqual(['unconfirmed']);

    const diag = summarizeCommentSubmitDiag();
    expect(diag.attempts).toBe(3);
    expect(diag.ok).toBe(2);
    expect(diag.fail).toBe(1);
    expect(diag.successRate).toBeCloseTo(2 / 3);
    expect(diag.recentFails).toEqual(['unconfirmed']);
  });

  it(`recentFails は ${NLS_COMMENT_SUBMIT_FAIL_REASONS_MAX} 件で頭から落ちる`, () => {
    for (let i = 0; i < NLS_COMMENT_SUBMIT_FAIL_REASONS_MAX + 2; i++) {
      recordCommentSubmitOutcome(false, 'post_failed');
    }
    const acc = /** @type {any} */ (globalThis[NLS_COMMENT_SUBMIT_OUTCOME_KEY]);
    expect(acc.recentFails.length).toBe(NLS_COMMENT_SUBMIT_FAIL_REASONS_MAX);
    expect(acc.recentFails.every((c) => c === 'exception')).toBe(true);
  });

  it('所要 ms 履歴から avg/max を出す', () => {
    recordCommentSubmitOutcome(true);
    recordCommentSubmitTotal('nls-cmt-content', 100);
    recordCommentSubmitTotal('nls-cmt-content', 300);
    const diag = summarizeCommentSubmitDiag();
    expect(diag.avgMs).toBe(200);
    expect(diag.maxMs).toBe(300);
  });

  it('所要 ms 履歴だけでも（outcome 無しでも）要約を返す', () => {
    recordCommentSubmitTotal('nls-cmt-content', 50);
    const diag = summarizeCommentSubmitDiag();
    expect(diag).not.toBeNull();
    expect(diag.attempts).toBe(0);
    expect(diag.successRate).toBeNull();
    expect(diag.avgMs).toBe(50);
  });

  it('globals を差し替えてテストできる（純関数性）', () => {
    const globals = {
      [NLS_COMMENT_SUBMIT_OUTCOME_KEY]: {
        total: 10,
        ok: 9,
        fail: 1,
        recentFails: ['no_button']
      },
      [NLS_COMMENT_SUBMIT_HISTORY_KEY]: [{ ms: 400 }, { ms: 600 }]
    };
    const diag = summarizeCommentSubmitDiag({ globals });
    expect(diag.attempts).toBe(10);
    expect(diag.successRate).toBe(0.9);
    expect(diag.avgMs).toBe(500);
    expect(diag.maxMs).toBe(600);
    expect(diag.recentFails).toEqual(['no_button']);
  });
});
