import { describe, expect, it } from 'vitest';
import {
  makeInitialCommentPostDiag,
  commentPostOutcomeKindForResult,
  buildCommentPostDiagSnapshot,
  buildCommentPostDiagLines,
  computeCommentEchoAverage,
  takeOptimisticPaintSamples
} from './commentPostDiag.js';

describe('makeInitialCommentPostDiag', () => {
  it('全カウンタ0・lastOutcome空・echoは-1(未計測)の初期値', () => {
    const s = makeInitialCommentPostDiag();
    expect(s.attempts).toBe(0);
    expect(s.okCount).toBe(0);
    expect(s.failCount).toBe(0);
    expect(s.timeoutCount).toBe(0);
    expect(s.revertCount).toBe(0);
    expect(s.totalRetryAttempts).toBe(0);
    expect(s.lastTotalMs).toBe(0);
    expect(s.lastOutcome).toBe('');
    expect(s.lastEventAt).toBe(0);
    expect(s.lastEchoMs).toBe(-1);
    expect(s.avgEchoMs).toBe(-1);
    expect(s.lastOptimisticPaintMs).toBe(-1);
    expect(s.avgOptimisticPaintMs).toBe(-1);
    expect(s.instantPaintRuns).toBe(0);
  });
});

describe('computeCommentEchoAverage(EMA・giftEffectDiag/voiceReadQueueと同方式)', () => {
  it('未計測(-1)から最初のサンプルはそのまま丸めた値になる', () => {
    expect(computeCommentEchoAverage(-1, 1000)).toBe(1000);
  });

  it('2回目以降はEMA(alpha=0.3既定)で均す', () => {
    const avg1 = computeCommentEchoAverage(-1, 1000);
    const avg2 = computeCommentEchoAverage(avg1, 2000);
    expect(avg2).toBe(Math.round(1000 + 0.3 * (2000 - 1000)));
  });

  it('負値/非数のサンプルは直前の平均を素通しする(未計測を汚染しない)', () => {
    expect(computeCommentEchoAverage(500, -1)).toBe(500);
    expect(computeCommentEchoAverage(500, NaN)).toBe(500);
    expect(computeCommentEchoAverage(-1, NaN)).toBe(-1);
  });

  it('alpha を指定できる', () => {
    const avg = computeCommentEchoAverage(1000, 2000, 0.5);
    expect(avg).toBe(1500);
  });
});

describe('takeOptimisticPaintSamples(comment-post-speed-DESIGN.md §F)', () => {
  it('displayedPendingAts に含まれる mark だけ sample 化し、含まれない mark は remaining に残す', () => {
    const marks = [{ at: 1000 }, { at: 2000 }, { at: 3000 }];
    const { samples, remaining } = takeOptimisticPaintSamples(marks, new Set([1000, 3000]), 4000);
    expect(samples).toEqual([3000, 1000]); // 4000-1000, 4000-3000
    expect(remaining).toEqual([{ at: 2000 }]);
  });

  it('配列で渡された displayedPendingAts も Set と同様に扱う', () => {
    const marks = [{ at: 1000 }];
    const { samples, remaining } = takeOptimisticPaintSamples(marks, [1000], 1500);
    expect(samples).toEqual([500]);
    expect(remaining).toEqual([]);
  });

  it('一致が無ければ全 mark が remaining に残り samples は空', () => {
    const marks = [{ at: 1000 }, { at: 2000 }];
    const { samples, remaining } = takeOptimisticPaintSamples(marks, new Set(), 3000);
    expect(samples).toEqual([]);
    expect(remaining).toEqual(marks);
  });

  it('marks が空/非配列でも落ちない', () => {
    expect(takeOptimisticPaintSamples([], new Set([1]), 100)).toEqual({ samples: [], remaining: [] });
    expect(takeOptimisticPaintSamples(null, new Set([1]), 100)).toEqual({ samples: [], remaining: [] });
    expect(takeOptimisticPaintSamples(undefined, new Set([1]), 100)).toEqual({ samples: [], remaining: [] });
  });

  it('at が非数値の mark は無視する(remaining にも samples にも入れない)', () => {
    const marks = [{ at: 'x' }, { at: 1000 }];
    const { samples, remaining } = takeOptimisticPaintSamples(marks, new Set([1000]), 1200);
    expect(samples).toEqual([200]);
    expect(remaining).toEqual([]);
  });

  it('nowMs より前の at でも負値にならない(Math.max(0, ...))', () => {
    const marks = [{ at: 5000 }];
    const { samples } = takeOptimisticPaintSamples(marks, new Set([5000]), 100);
    expect(samples).toEqual([0]);
  });
});

describe('commentPostOutcomeKindForResult(嘘をつかない分類)', () => {
  it('ok:true は ok', () => {
    expect(commentPostOutcomeKindForResult({ ok: true })).toBe('ok');
  });

  it('timedOut:true は timeout(failとは別扱い)', () => {
    expect(commentPostOutcomeKindForResult({ ok: false, timedOut: true })).toBe('timeout');
  });

  it('ok:false かつ timedOutなしは fail', () => {
    expect(commentPostOutcomeKindForResult({ ok: false })).toBe('fail');
  });

  it('null/undefined は fail(不明を成功扱いしない)', () => {
    expect(commentPostOutcomeKindForResult(null)).toBe('fail');
    expect(commentPostOutcomeKindForResult(undefined)).toBe('fail');
  });
});

describe('buildCommentPostDiagSnapshot', () => {
  it('欠損フィールドは初期値で埋める', () => {
    const snap = buildCommentPostDiagSnapshot({ attempts: 3 });
    expect(snap.attempts).toBe(3);
    expect(snap.okCount).toBe(0);
  });

  it('null/undefined も初期値', () => {
    expect(buildCommentPostDiagSnapshot(null, 100)).toMatchObject(makeInitialCommentPostDiag());
    expect(buildCommentPostDiagSnapshot(undefined, 100)).toMatchObject(makeInitialCommentPostDiag());
  });

  it('capturedAt に nowMs が入る', () => {
    expect(buildCommentPostDiagSnapshot({}, 12345).capturedAt).toBe(12345);
  });

  it('非数値フィールドは初期値にフォールバックする', () => {
    const snap = buildCommentPostDiagSnapshot({ attempts: 'x', timeoutCount: NaN }, 1);
    expect(snap.attempts).toBe(0);
    expect(snap.timeoutCount).toBe(0);
  });

  it('lastOutcome は文字列化される', () => {
    expect(buildCommentPostDiagSnapshot({ lastOutcome: 'timeout' }, 1).lastOutcome).toBe('timeout');
    expect(buildCommentPostDiagSnapshot({}, 1).lastOutcome).toBe('');
  });
});

describe('buildCommentPostDiagLines', () => {
  it('null/undefined は空配列', () => {
    expect(buildCommentPostDiagLines(null, 100)).toEqual([]);
    expect(buildCommentPostDiagLines(undefined, 100)).toEqual([]);
  });

  it('未観測(試行0)は空配列(ノイズにしない)', () => {
    const snap = buildCommentPostDiagSnapshot({}, 100);
    expect(buildCommentPostDiagLines(snap, 100)).toEqual([]);
  });

  it('試行・成功・失敗・締切超過の内訳を2行で表示する(echo未計測なら送信応答のみ)', () => {
    const snap = buildCommentPostDiagSnapshot(
      {
        attempts: 5,
        okCount: 3,
        failCount: 1,
        timeoutCount: 1,
        revertCount: 1,
        totalRetryAttempts: 8,
        lastTotalMs: 1234,
        lastOutcome: 'timeout',
        lastEventAt: 900
      },
      1000
    );
    const lines = buildCommentPostDiagLines(snap, 1000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('試行5');
    expect(lines[0]).toContain('ok3');
    expect(lines[0]).toContain('失敗1');
    expect(lines[0]).toContain('締切1');
    expect(lines[0]).toContain('最終0秒前');
    expect(lines[0]).toContain('(timeout)');
    expect(lines[1]).toBe('  → 送信応答 直近1.2秒 / フレーム試行累計8 / 取消1');
    expect(lines[1]).not.toContain('echo');
  });

  it('締切超過が非0のときも表示に含まれる(嘘をつかない=不明を隠さない)', () => {
    const snap = buildCommentPostDiagSnapshot(
      { attempts: 2, okCount: 0, failCount: 0, timeoutCount: 2 },
      1000
    );
    const lines = buildCommentPostDiagLines(snap, 1000);
    expect(lines[0]).toContain('締切2');
  });

  it('echo計測済みなら送信応答の行にecho直近/平均を付記する', () => {
    const snap = buildCommentPostDiagSnapshot(
      {
        attempts: 1,
        okCount: 1,
        lastTotalMs: 500,
        lastEchoMs: 2500,
        avgEchoMs: 2200
      },
      1000
    );
    const lines = buildCommentPostDiagLines(snap, 1000);
    expect(lines[1]).toContain('画面実着(echo) 直近2.5秒(平均2.2秒)');
  });

  it('echo未計測(-1)なら送信応答の行にechoを出さない(ノイズにしない)', () => {
    const snap = buildCommentPostDiagSnapshot({ attempts: 1, okCount: 1, lastTotalMs: 500 }, 1000);
    const lines = buildCommentPostDiagLines(snap, 1000);
    expect(lines[1]).not.toContain('画面実着');
  });

  it('comment-post-speed-DESIGN.md §F: 楽観表示が計測済みなら3行目に直近/平均/即時paint回数を出す', () => {
    const snap = buildCommentPostDiagSnapshot(
      {
        attempts: 1,
        okCount: 1,
        lastTotalMs: 500,
        lastOptimisticPaintMs: 400,
        avgOptimisticPaintMs: 550,
        instantPaintRuns: 3
      },
      1000
    );
    const lines = buildCommentPostDiagLines(snap, 1000);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('  → 楽観表示 直近0.4秒(平均0.6秒) / 即時paint3回');
  });

  it('楽観表示未計測(-1)なら3行目を出さない(ノイズにしない・既存2行のまま)', () => {
    const snap = buildCommentPostDiagSnapshot({ attempts: 1, okCount: 1, lastTotalMs: 500 }, 1000);
    const lines = buildCommentPostDiagLines(snap, 1000);
    expect(lines).toHaveLength(2);
  });
});
