import { describe, expect, it } from 'vitest';
import {
  reachBgmDecision,
  makeInitialReachBgmState,
  reachBgmMinPlaySatisfied,
  feverBgmStart,
  feverBgmExtend,
  feverBgmShouldEnd,
  feverBgmStop,
  makeInitialFeverBgmState,
  reachLoopVariantIndex,
  feverLoopVariantIndex,
  clampBgmVolume,
  BGM_VOLUME_MAX,
  REACH_IN_DWELL_MS,
  REACH_MIN_PLAY_MS,
  REACH_REENTRY_BLOCK_MS,
  REACH_OUT_DWELL_MS,
  FEVER_BASE_DURATION_MS,
  FEVER_MAX_DURATION_MS
} from './bgmDirector.js';
import { PHASE } from './phaseDirector.js';

const T = 1_000_000;

describe('clampBgmVolume', () => {
  it('上限0.30にクランプする', () => {
    expect(clampBgmVolume(0.9)).toBe(BGM_VOLUME_MAX);
    expect(clampBgmVolume(0.1)).toBeCloseTo(0.1, 6);
    expect(clampBgmVolume(-1)).toBe(0);
  });
});

describe('reachBgmDecision イン判定', () => {
  it('リーチ入り直後(15秒未満)はまだ鳴らさない', () => {
    const s = { ...makeInitialReachBgmState(), reachSinceMs: T };
    const d = reachBgmDecision(s, PHASE.REACH, 2.6, T + REACH_IN_DWELL_MS - 1);
    expect(d.action).toBe('none');
  });

  it('リーチが15秒継続したらイン', () => {
    const s = { ...makeInitialReachBgmState(), reachSinceMs: T };
    const d = reachBgmDecision(s, PHASE.REACH, 2.6, T + REACH_IN_DWELL_MS);
    expect(d.action).toBe('start');
    expect(d.nextState.playing).toBe(true);
    expect(d.nextState.loopIndex).toBe(1);
  });

  it('bgmEnabled=falseなら継続時間を満たしても鳴らさない(既定OFF)', () => {
    const s = { ...makeInitialReachBgmState(), reachSinceMs: T };
    const d = reachBgmDecision(s, PHASE.REACH, 2.6, T + REACH_IN_DWELL_MS, { bgmEnabled: false });
    expect(d.action).toBe('none');
  });

  it('停止後60秒以内は再イン禁止', () => {
    const s = { ...makeInitialReachBgmState(), reachSinceMs: T, stoppedAt: T + 1000 };
    const d = reachBgmDecision(s, PHASE.REACH, 2.6, T + 1000 + REACH_REENTRY_BLOCK_MS - 1);
    expect(d.action).toBe('none');
  });

  it('停止後60秒経過すれば再イン可能', () => {
    const s = { ...makeInitialReachBgmState(), reachSinceMs: T, stoppedAt: T };
    const d = reachBgmDecision(s, PHASE.REACH, 2.6, T + REACH_REENTRY_BLOCK_MS + REACH_IN_DWELL_MS);
    expect(d.action).toBe('start');
  });
});

describe('reachBgmDecision アウト判定', () => {
  it('突破/大当たり遷移(フェーズがリーチでなくなる)で即アウト', () => {
    const s = { ...makeInitialReachBgmState(), playing: true, startedAt: T, reachSinceMs: T };
    const d = reachBgmDecision(s, PHASE.BREAKTHROUGH, 4.0, T + 1000);
    expect(d.action).toBe('stop');
    expect(d.nextState.playing).toBe(false);
  });

  it('R<2.0が30秒未満ならまだ鳴り続ける', () => {
    const s = { ...makeInitialReachBgmState(), playing: true, startedAt: T, reachSinceMs: T };
    const d = reachBgmDecision(s, PHASE.REACH, 1.9, T + REACH_OUT_DWELL_MS - 1);
    expect(d.action).toBe('none');
    expect(d.nextState.playing).toBe(true);
  });

  it('R<2.0が30秒継続したらアウト', () => {
    const s = { ...makeInitialReachBgmState(), playing: true, startedAt: T, reachSinceMs: T };
    let d = reachBgmDecision(s, PHASE.REACH, 1.9, T + 1000); // belowOutSinceMs開始
    expect(d.action).toBe('none');
    d = reachBgmDecision(d.nextState, PHASE.REACH, 1.9, T + 1000 + REACH_OUT_DWELL_MS);
    expect(d.action).toBe('stop');
  });

  it('R<2.0から回復するとタイマーがリセットされる', () => {
    const s = { ...makeInitialReachBgmState(), playing: true, startedAt: T, reachSinceMs: T };
    let d = reachBgmDecision(s, PHASE.REACH, 1.9, T + 1000);
    d = reachBgmDecision(d.nextState, PHASE.REACH, 2.6, T + 2000); // 回復
    expect(d.nextState.belowOutSinceMs).toBe(0);
  });
});

describe('reachBgmMinPlaySatisfied', () => {
  it('30秒未満はfalse', () => {
    const s = { playing: true, startedAt: T };
    expect(reachBgmMinPlaySatisfied(s, T + REACH_MIN_PLAY_MS - 1)).toBe(false);
  });
  it('30秒以上でtrue', () => {
    const s = { playing: true, startedAt: T };
    expect(reachBgmMinPlaySatisfied(s, T + REACH_MIN_PLAY_MS)).toBe(true);
  });
  it('再生していなければtrue(制約対象外)', () => {
    expect(reachBgmMinPlaySatisfied({ playing: false }, T)).toBe(true);
  });
});

describe('フィーバーBGM', () => {
  it('開始で固定60秒がセットされる', () => {
    const d = feverBgmStart(makeInitialFeverBgmState(), T);
    expect(d.action).toBe('start');
    expect(d.nextState.durationMs).toBe(FEVER_BASE_DURATION_MS);
    expect(d.nextState.loopIndex).toBe(1);
  });

  it('bgmEnabled=falseなら開始しない', () => {
    const d = feverBgmStart(makeInitialFeverBgmState(), T, { bgmEnabled: false });
    expect(d.action).toBe('none');
  });

  it('延長は+30秒ずつ、上限180秒でクランプ', () => {
    let s = feverBgmStart(makeInitialFeverBgmState(), T).nextState; // 60000
    s = feverBgmExtend(s); // 90000
    expect(s.durationMs).toBe(90_000);
    s = feverBgmExtend(s); // 120000
    s = feverBgmExtend(s); // 150000
    s = feverBgmExtend(s); // 180000(上限)
    expect(s.durationMs).toBe(FEVER_MAX_DURATION_MS);
    s = feverBgmExtend(s); // 上限超えない
    expect(s.durationMs).toBe(FEVER_MAX_DURATION_MS);
  });

  it('shouldEnd: 継続時間経過で終了判定', () => {
    const s = feverBgmStart(makeInitialFeverBgmState(), T).nextState;
    expect(feverBgmShouldEnd(s, T + FEVER_BASE_DURATION_MS - 1)).toBe(false);
    expect(feverBgmShouldEnd(s, T + FEVER_BASE_DURATION_MS)).toBe(true);
  });

  it('stopで初期状態に戻る', () => {
    const s = feverBgmStart(makeInitialFeverBgmState(), T).nextState;
    const stopped = feverBgmStop(s);
    expect(stopped.playing).toBe(false);
  });
});

describe('ループ選択の決定論(§5.3)', () => {
  it('リーチは奇数回目/偶数回目で交互(0-indexed)', () => {
    expect(reachLoopVariantIndex(1)).toBe(0);
    expect(reachLoopVariantIndex(2)).toBe(1);
    expect(reachLoopVariantIndex(3)).toBe(0);
    expect(reachLoopVariantIndex(4)).toBe(1);
  });

  it('フィーバーは(n-1) mod 6の順繰り', () => {
    expect(feverLoopVariantIndex(1)).toBe(0);
    expect(feverLoopVariantIndex(6)).toBe(5);
    expect(feverLoopVariantIndex(7)).toBe(0);
    expect(feverLoopVariantIndex(13)).toBe(0);
  });
});

describe('決定論', () => {
  it('reachBgmDecisionは同じ入力に同じ結果', () => {
    const s = { ...makeInitialReachBgmState(), reachSinceMs: T };
    const d1 = reachBgmDecision(s, PHASE.REACH, 2.6, T + REACH_IN_DWELL_MS);
    const d2 = reachBgmDecision(s, PHASE.REACH, 2.6, T + REACH_IN_DWELL_MS);
    expect(d1).toEqual(d2);
  });
});
