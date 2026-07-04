import { describe, expect, it } from 'vitest';
import {
  baselineFor,
  relativeRatio,
  rWithWarmup,
  phaseFor,
  makeInitialPhaseState,
  makeInitialBaselineState,
  PHASE,
  BASELINE_FLOOR,
  BASELINE_HALF_LIFE_MS,
  WARMUP_MS,
  REACH_MAX_DWELL_MS
} from './phaseDirector.js';

const T = 1_000_000;

describe('baselineFor', () => {
  it('初回はMそのものから開始する', () => {
    const b = baselineFor(makeInitialBaselineState(), 8, 0);
    expect(b.value).toBe(8);
  });

  it('半減期10分でMへ収束していく(EMA)', () => {
    let b = baselineFor(null, 4, 0); // 初回B=4
    // 10分経過でMとの差が半分になる。M=8で固定入力し続ける。
    b = baselineFor(b, 8, BASELINE_HALF_LIFE_MS);
    expect(b.value).toBeCloseTo(6, 5); // 4 + (8-4)*0.5 = 6
    b = baselineFor(b, 8, BASELINE_HALF_LIFE_MS);
    expect(b.value).toBeCloseTo(7, 5); // 6 + (8-6)*0.5 = 7
  });

  it('長時間経過させるとMにほぼ収束する', () => {
    let b = baselineFor(null, 1, 0);
    for (let i = 0; i < 30; i++) {
      b = baselineFor(b, 10, BASELINE_HALF_LIFE_MS);
    }
    expect(b.value).toBeGreaterThan(9.99);
  });

  it('経過時間0では値が変わらない', () => {
    let b = baselineFor(null, 5, 0);
    b = baselineFor(b, 100, 0);
    expect(b.value).toBe(5);
  });
});

describe('relativeRatio + B_floor', () => {
  it('Bが下限未満でも下限で割る(過敏化防止)', () => {
    expect(relativeRatio(4, 0.5)).toBeCloseTo(4 / BASELINE_FLOOR, 6);
  });

  it('過疎配信シナリオ: B=3, M=8 → R=8/3(≈2.67)でリーチ到達水準', () => {
    const r = relativeRatio(8, 3);
    expect(r).toBeCloseTo(8 / 3, 6);
    expect(r).toBeGreaterThanOrEqual(2.5); // リーチ入りの閾値を過疎B=3でも越えられる
  });
});

describe('rWithWarmup', () => {
  it('ウォームアップ中(3分未満)は常に1.0固定', () => {
    expect(rWithWarmup(100, 1, WARMUP_MS - 1)).toBe(1.0);
  });
  it('ウォームアップ経過後は通常のR計算', () => {
    expect(rWithWarmup(10, 5, WARMUP_MS)).toBeCloseTo(2, 6);
  });
});

describe('phaseFor 基本遷移', () => {
  it('通常→煽り: R>=1.5', () => {
    const r = phaseFor(makeInitialPhaseState(T), 1.5, {}, T + 1000);
    expect(r.phase).toBe(PHASE.ATSUI);
    expect(r.changed).toBe(true);
    expect(r.silent).toBe(false);
  });

  it('R<1.5では通常のまま', () => {
    const r = phaseFor(makeInitialPhaseState(T), 1.2, {}, T + 1000);
    expect(r.phase).toBe(PHASE.NORMAL);
    expect(r.changed).toBe(false);
  });

  it('煽り→リーチ: R>=2.5', () => {
    const s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    const r = phaseFor(s, 2.5, {}, T + 1000);
    expect(r.phase).toBe(PHASE.REACH);
    expect(r.silent).toBe(false);
  });

  it('煽り→リーチ: 節目接近でもR不問で遷移', () => {
    const s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    const r = phaseFor(s, 0, { milestoneApproach: true }, T + 1000);
    expect(r.phase).toBe(PHASE.REACH);
  });

  it('リーチ→突破: R>=4.0', () => {
    let s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    s = phaseFor(s, 2.5, {}, T + 1000).nextState;
    const r = phaseFor(s, 4.0, {}, T + 2000);
    expect(r.phase).toBe(PHASE.BREAKTHROUGH);
  });

  it('リーチ→突破: gift_large以上イベントでも遷移', () => {
    let s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    s = phaseFor(s, 2.5, {}, T + 1000).nextState;
    const r = phaseFor(s, 0, { giftLargeOrAbove: true }, T + 2000);
    expect(r.phase).toBe(PHASE.BREAKTHROUGH);
  });

  it('突破→大当たり: 節目1000+', () => {
    const s = { phase: PHASE.BREAKTHROUGH, enteredAt: T, belowOutThresholdSinceMs: 0, highestR: 0, holdLampBand: 0, holdLampBandAtMs: 0 };
    const r = phaseFor(s, 0, { milestoneHit1000Plus: true }, T + 500);
    expect(r.phase).toBe(PHASE.JACKPOT);
  });

  it('大当たり→払い出しは自動チェーン', () => {
    const s = { phase: PHASE.JACKPOT, enteredAt: T, belowOutThresholdSinceMs: 0, highestR: 0, holdLampBand: 0, holdLampBandAtMs: 0 };
    const r = phaseFor(s, 0, {}, T + 100);
    expect(r.phase).toBe(PHASE.PAYOUT);
  });

  it('払い出し→通常はpayoutChainDone合図で遷移', () => {
    const s = { phase: PHASE.PAYOUT, enteredAt: T, belowOutThresholdSinceMs: 0, highestR: 0, holdLampBand: 0, holdLampBandAtMs: 0 };
    const stayed = phaseFor(s, 0, {}, T + 100);
    expect(stayed.phase).toBe(PHASE.PAYOUT);
    const r = phaseFor(s, 0, { payoutChainDone: true }, T + 100);
    expect(r.phase).toBe(PHASE.NORMAL);
  });
});

describe('phaseFor ヒステリシス(チャタリング防止)', () => {
  it('リーチin(2.5)direct後、out(2.0)を割っても60秒未満なら降格しない', () => {
    let s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    s = phaseFor(s, 2.5, {}, T + 1000).nextState; // リーチ入り
    // R=2.0(=out閾値ちょうど)は「未満」ではないので降格しない
    let r = phaseFor(s, 2.0, {}, T + 2000);
    expect(r.phase).toBe(PHASE.REACH);
    expect(r.changed).toBe(false);
    // R=1.9(out閾値未満)だが経過30秒だけでは降格しない
    r = phaseFor(r.nextState, 1.9, {}, T + 2000 + 30_000);
    expect(r.phase).toBe(PHASE.REACH);
    expect(r.changed).toBe(false);
  });

  it('out閾値未満が60秒継続すると無音で1段降格する', () => {
    let s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    s = phaseFor(s, 2.5, {}, T + 1000).nextState; // リーチ入り
    let r = phaseFor(s, 1.9, {}, T + 2000); // out閾値未満に入った瞬間
    expect(r.changed).toBe(false);
    r = phaseFor(r.nextState, 1.9, {}, T + 2000 + 60_000); // 60秒継続
    expect(r.phase).toBe(PHASE.ATSUI);
    expect(r.changed).toBe(true);
    expect(r.silent).toBe(true); // 偽の解決音を鳴らさない=無音降格
  });

  it('out閾値未満から一度でも回復するとタイマーがリセットされる(チャタリングしない)', () => {
    let s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    s = phaseFor(s, 2.5, {}, T + 1000).nextState; // リーチ入り
    let r = phaseFor(s, 1.9, {}, T + 2000); // out閾値未満
    r = phaseFor(r.nextState, 2.6, {}, T + 2000 + 30_000); // 回復(in以上)
    expect(r.nextState.belowOutThresholdSinceMs).toBe(0);
    // その後また未満に入っても、再度60秒必要(直前の30秒はリセットされている)
    r = phaseFor(r.nextState, 1.9, {}, T + 2000 + 30_000 + 1000);
    r = phaseFor(r.nextState, 1.9, {}, T + 2000 + 30_000 + 1000 + 59_000);
    expect(r.phase).toBe(PHASE.REACH); // まだ60秒経っていない(59秒)ので降格しない
  });
});

describe('リーチ滞在120秒上限', () => {
  it('突破に届かないままリーチが120秒続くと無音で通常へ戻す', () => {
    let s = phaseFor(makeInitialPhaseState(T), 1.5, {}, T).nextState;
    s = phaseFor(s, 2.5, {}, T + 1000).nextState; // リーチ入り(enteredAt = T+1000)
    // R=2.5を維持し続ける(降格ヒステリシスには当たらない)が突破条件は満たさない
    const r = phaseFor(s, 2.5, {}, T + 1000 + REACH_MAX_DWELL_MS);
    expect(r.phase).toBe(PHASE.NORMAL);
    expect(r.silent).toBe(true);
  });
});

describe('hold_lamp', () => {
  it('帯を上向きに跨いだ瞬間だけ発火する', () => {
    const s = makeInitialPhaseState(T);
    let r = phaseFor(s, 0.5, {}, T); // 0.5 → 帯0、跨いでいない
    expect(r.holdLampFired).toBe(false);
    r = phaseFor(r.nextState, 1.2, {}, T + 1000); // 0→1帯 上向き
    expect(r.holdLampFired).toBe(true);
  });

  it('下向きの帯移動では発火しない', () => {
    const s = makeInitialPhaseState(T);
    let r = phaseFor(s, 2.6, {}, T); // 帯4まで一気に上げる(初回なので発火してもよい)
    r = phaseFor(r.nextState, 1.5, {}, T + 1000); // 下向き(帯2)
    expect(r.holdLampFired).toBe(false);
  });

  it('同じ帯へ再度上向きに入っても20秒以内はCDで発火しない', () => {
    const s = makeInitialPhaseState(T);
    let r = phaseFor(s, 1.2, {}, T); // 帯1・発火
    expect(r.holdLampFired).toBe(true);
    r = phaseFor(r.nextState, 0.5, {}, T + 1000); // 帯0へ下降
    r = phaseFor(r.nextState, 1.2, {}, T + 2000); // 帯1へ再上昇(20秒未満)
    expect(r.holdLampFired).toBe(false);
  });

  it('20秒経過後に同帯へ再上昇すれば発火する', () => {
    const s = makeInitialPhaseState(T);
    let r = phaseFor(s, 1.2, {}, T);
    r = phaseFor(r.nextState, 0.5, {}, T + 1000);
    r = phaseFor(r.nextState, 1.2, {}, T + 1000 + 20_000);
    expect(r.holdLampFired).toBe(true);
  });
});

describe('決定論', () => {
  it('同じ入力には常に同じ結果を返す', () => {
    const s = makeInitialPhaseState(T);
    const r1 = phaseFor(s, 1.6, { comboStreak: 1 }, T + 500);
    const r2 = phaseFor(s, 1.6, { comboStreak: 1 }, T + 500);
    expect(r1).toEqual(r2);
  });
});
