import { describe, it, expect } from 'vitest';
import { computeBroadcastScore, computeBroadcastScoreV2, rankForScore } from './broadcastScore.js';

describe('rankForScore', () => {
  it('90以上はS', () => {
    expect(rankForScore(90)).toBe('S');
    expect(rankForScore(100)).toBe('S');
  });
  it('75-89はA', () => {
    expect(rankForScore(75)).toBe('A');
    expect(rankForScore(89)).toBe('A');
  });
  it('55-74はB', () => {
    expect(rankForScore(55)).toBe('B');
  });
  it('35-54はC', () => {
    expect(rankForScore(35)).toBe('C');
  });
  it('35未満はD', () => {
    expect(rankForScore(0)).toBe('D');
    expect(rankForScore(34)).toBe('D');
  });
});

describe('computeBroadcastScore', () => {
  it('null/undefined でも死なず全て0点付近のスコアを返す', () => {
    const s = computeBroadcastScore(null);
    expect(s.total).toBe(0);
    expect(s.rank).toBe('D');
    expect(s.parts).toEqual({ volume: 0, people: 0, pace: 0, heat: 0 });
  });

  it('コメントが多く人数も多い配信は高得点', () => {
    const s = computeBroadcastScore({
      totalComments: 3000,
      commenters: 600,
      commentsPerMinute: 15,
      heavyPct: 20,
      oncePct: 30
    });
    expect(s.total).toBeGreaterThan(70);
    expect(['A', 'S']).toContain(s.rank);
  });

  it('小規模配信でも0点にはならない(対数スケール)', () => {
    const s = computeBroadcastScore({
      totalComments: 10,
      commenters: 5,
      commentsPerMinute: 1,
      heavyPct: 0,
      oncePct: 80
    });
    expect(s.total).toBeGreaterThan(0);
  });

  it('total は0-100にクランプされる', () => {
    const s = computeBroadcastScore({
      totalComments: 1_000_000,
      commenters: 1_000_000,
      commentsPerMinute: 1000,
      heavyPct: 100,
      oncePct: 0
    });
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it('一度きり率が高いと熱量スコアが下がる', () => {
    const base = { totalComments: 500, commenters: 100, commentsPerMinute: 5, heavyPct: 10 };
    const lowOnce = computeBroadcastScore({ ...base, oncePct: 10 });
    const highOnce = computeBroadcastScore({ ...base, oncePct: 90 });
    expect(lowOnce.parts.heat).toBeGreaterThan(highOnce.parts.heat);
  });

  it('非数値・負値は0扱い(死なない)', () => {
    const s = computeBroadcastScore({
      totalComments: 'x',
      commenters: -5,
      commentsPerMinute: null,
      heavyPct: undefined,
      oncePct: NaN
    });
    expect(Number.isFinite(s.total)).toBe(true);
    expect(s.total).toBeGreaterThanOrEqual(0);
  });
});

describe('computeBroadcastScoreV2', () => {
  const preview = {
    totalComments: 3000,
    commenters: 600,
    commentsPerMinute: 15,
    heavyPct: 20,
    oncePct: 30
  };

  it('phaseStats が null/undefined なら bonus=0(v1と同傾向に縮退)', () => {
    const v1 = computeBroadcastScore(preview);
    const v2Null = computeBroadcastScoreV2(preview, null);
    const v2Undef = computeBroadcastScoreV2(preview, undefined);
    expect(v2Null.bonus).toBe(0);
    expect(v2Undef.bonus).toBe(0);
    expect(v2Null.base).toBe(v1.total);
    expect(v2Null.total).toBe(Math.round(v1.total * 0.8));
  });

  it('同じ入力には常に同じ結果(決定論)', () => {
    const phaseStats = { reachCount: 2, breakthroughCount: 1, jackpotCount: 1 };
    const a = computeBroadcastScoreV2(preview, phaseStats);
    const b = computeBroadcastScoreV2(preview, phaseStats);
    expect(a).toEqual(b);
  });

  it('感性ボーナスは各内訳の合計・上限20でクランプされる(大量のフェーズ実績でも張り付く)', () => {
    const v2 = computeBroadcastScoreV2(preview, { reachCount: 100, breakthroughCount: 100, jackpotCount: 100 });
    expect(v2.bonus).toBe(20);
    expect(v2.bonusParts.reach).toBe(6);
    expect(v2.bonusParts.breakthrough).toBe(6);
    expect(v2.bonusParts.jackpot).toBe(8);
  });

  it('各内訳が個別の上限を持つ(reach上限6・breakthrough上限6・jackpot上限8)', () => {
    const v2 = computeBroadcastScoreV2(preview, { reachCount: 1, breakthroughCount: 1, jackpotCount: 1 });
    expect(v2.bonusParts.reach).toBe(2); // 1×2
    expect(v2.bonusParts.breakthrough).toBe(3); // 1×3
    expect(v2.bonusParts.jackpot).toBe(4); // 1×4
    expect(v2.bonus).toBe(9);
  });

  it('total は base×0.8+bonus を四捨五入し0-100にクランプ(0点ガード含む)', () => {
    const v2 = computeBroadcastScoreV2(null, null);
    expect(v2.base).toBe(0);
    expect(v2.bonus).toBe(0);
    expect(v2.total).toBe(0);
    expect(v2.rank).toBe('D');

    const v2Max = computeBroadcastScoreV2(
      { totalComments: 1_000_000, commenters: 1_000_000, commentsPerMinute: 1000, heavyPct: 100, oncePct: 0 },
      { reachCount: 100, breakthroughCount: 100, jackpotCount: 100 }
    );
    expect(v2Max.total).toBeLessThanOrEqual(100);
  });

  it('rank は既存 rankForScore の閾値をそのまま使う(S90/A75/B55/C35は変更しない)', () => {
    const v2 = computeBroadcastScoreV2(preview, { reachCount: 3, breakthroughCount: 2, jackpotCount: 1 });
    expect(v2.rank).toBe(rankForScore(v2.total));
  });

  it('非数値・負値のphaseStatsは0扱い(死なない)', () => {
    const v2 = computeBroadcastScoreV2(preview, { reachCount: 'x', breakthroughCount: -5, jackpotCount: NaN });
    expect(Number.isFinite(v2.bonus)).toBe(true);
    expect(v2.bonus).toBe(0);
  });

  it('parts は既存v1の4パーツをそのまま引き継ぐ', () => {
    const v1 = computeBroadcastScore(preview);
    const v2 = computeBroadcastScoreV2(preview, null);
    expect(v2.parts).toEqual(v1.parts);
  });
});
