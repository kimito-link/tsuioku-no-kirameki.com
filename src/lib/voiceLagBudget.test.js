import { describe, it, expect } from 'vitest';
import { VOICE_STALE_MS_NORMAL } from './voiceAgeGate.js';
import {
  VOICE_LAG_BUDGET_MS,
  VOICE_QUEUE_MAX_CEIL,
  VOICE_QUEUE_MAX_FLOOR,
  VOICE_GROW_STREAK_N,
  updateVoiceServiceTimeEma,
  resolveVoiceQueueMax,
  stepVoiceQueueMax
} from './voiceLagBudget.js';

/**
 * voiceLagBudget.js — 会場読み上げの件数ゲート実効上限をラグ予算(処理時間EMA)から
 * 動的に算出する純関数群(diagnostic先行アプローチ・段階0=shadow計測のみ)。
 * 設計正本: venue-bubble-voice-realtime-max-DESIGN.md(C-1章)。
 */

describe('定数の不変条件(地雷G-1: 鮮度しきい値との食い違い防止)', () => {
  it('VOICE_LAG_BUDGET_MSはVOICE_STALE_MS_NORMALより必ず小さい(件数ゲートが時間ゲートより先に効く)', () => {
    expect(VOICE_LAG_BUDGET_MS).toBeLessThan(VOICE_STALE_MS_NORMAL);
  });

  it('VOICE_QUEUE_MAX_FLOORはVOICE_QUEUE_MAX_CEIL以下', () => {
    expect(VOICE_QUEUE_MAX_FLOOR).toBeLessThanOrEqual(VOICE_QUEUE_MAX_CEIL);
  });

  it('VOICE_QUEUE_MAX_CEILは8(8→12引き上げは却下済み案のため天井を変えない)', () => {
    expect(VOICE_QUEUE_MAX_CEIL).toBe(8);
  });

  it('VOICE_QUEUE_MAX_FLOORは2(ゼロ音声防止の床)', () => {
    expect(VOICE_QUEUE_MAX_FLOOR).toBe(2);
  });
});

describe('updateVoiceServiceTimeEma', () => {
  it('初回(prevMs=-1)はsampleMsをそのまま採用', () => {
    expect(updateVoiceServiceTimeEma(-1, 1000)).toBe(1000);
  });

  it('2回目以降はEMA(alpha=0.3既定)で平滑化される', () => {
    const next = updateVoiceServiceTimeEma(1000, 2000);
    // 1000 + 0.3*(2000-1000) = 1300
    expect(next).toBeCloseTo(1300, 5);
  });

  it('alphaを明示指定できる', () => {
    const next = updateVoiceServiceTimeEma(1000, 2000, 0.5);
    expect(next).toBeCloseTo(1500, 5);
  });

  it('負のsampleMsは0として扱う(壊れない)', () => {
    expect(updateVoiceServiceTimeEma(-1, -500)).toBe(0);
  });
});

describe('resolveVoiceQueueMax', () => {
  it('未計測(-1)はfail-openでCEIL(8)を返す', () => {
    expect(resolveVoiceQueueMax(-1)).toBe(VOICE_QUEUE_MAX_CEIL);
  });

  it('平常時(750ms/件)は上限8のまま(6000/750=8)', () => {
    expect(resolveVoiceQueueMax(750)).toBe(8);
  });

  it('やや詰まる(1500ms/件)と4まで縮む(6000/1500=4)', () => {
    expect(resolveVoiceQueueMax(1500)).toBe(4);
  });

  it('大きく詰まる(3000ms/件)と2まで縮む(6000/3000=2)', () => {
    expect(resolveVoiceQueueMax(3000)).toBe(2);
  });

  it('極端に詰まっても床(2)を下回らない', () => {
    expect(resolveVoiceQueueMax(60000)).toBe(VOICE_QUEUE_MAX_FLOOR);
  });

  it('0や負数は未計測相当としてCEILを返す(壊れない)', () => {
    expect(resolveVoiceQueueMax(0)).toBe(VOICE_QUEUE_MAX_CEIL);
    expect(resolveVoiceQueueMax(-100)).toBe(VOICE_QUEUE_MAX_CEIL);
  });
});

describe('stepVoiceQueueMax(ヒステリシス: 縮小即時・復帰N件連続)', () => {
  it('計算値が現行より小さいときは即座に縮小しgrowStreakは0に戻る', () => {
    const result = stepVoiceQueueMax(8, 4, 3);
    expect(result.nextMax).toBe(4);
    expect(result.nextGrowStreak).toBe(0);
  });

  it('計算値が現行と同じときは変化なし', () => {
    const result = stepVoiceQueueMax(8, 8, 0);
    expect(result.nextMax).toBe(8);
    expect(result.nextGrowStreak).toBe(0);
  });

  it('計算値が現行より大きいがstreak不足なら復帰しない(縮小状態を維持)', () => {
    const result = stepVoiceQueueMax(4, 8, 1);
    expect(result.nextMax).toBe(4);
    expect(result.nextGrowStreak).toBe(2);
  });

  it('streakがVOICE_GROW_STREAK_N-1に到達した回でようやく+1段復帰する', () => {
    let max = 4;
    let streak = 0;
    for (let i = 0; i < VOICE_GROW_STREAK_N - 1; i += 1) {
      const r = stepVoiceQueueMax(max, 8, streak);
      max = r.nextMax;
      streak = r.nextGrowStreak;
    }
    expect(max).toBe(4); // まだ復帰しない
    const finalStep = stepVoiceQueueMax(max, 8, streak);
    expect(finalStep.nextMax).toBe(5); // ここでようやく+1段
    expect(finalStep.nextGrowStreak).toBe(0);
  });

  it('復帰は+1段ずつ(計算値がCEILでも一気に飛ばない)', () => {
    const max = 2;
    const streak = VOICE_GROW_STREAK_N - 1;
    const result = stepVoiceQueueMax(max, 8, streak);
    expect(result.nextMax).toBe(3);
  });

  it('急激な負荷変動でも往復(ピンポン)しない(地雷G-2): 縮小→復帰境界を連続して跨いでも発振しない', () => {
    let max = 8;
    let streak = 0;
    const sequence = [4, 8, 4, 8, 4, 8, 4, 8];
    const history = [];
    for (const computed of sequence) {
      const r = stepVoiceQueueMax(max, computed, streak);
      max = r.nextMax;
      streak = r.nextGrowStreak;
      history.push(max);
    }
    // 縮小は毎回即座に反映されるが、8への復帰はstreak不足のため一度も起きない
    expect(history.every((m) => m <= 8 && m >= VOICE_QUEUE_MAX_FLOOR)).toBe(true);
    expect(max).toBe(4); // 最後は計算値4で縮小のまま(往復せず安定)
  });

  it('現行値がCEILを超えないようclampされる', () => {
    const result = stepVoiceQueueMax(8, 20, 10);
    expect(result.nextMax).toBeLessThanOrEqual(VOICE_QUEUE_MAX_CEIL);
  });

  it('現行値がFLOORを下回らないようclampされる', () => {
    const result = stepVoiceQueueMax(2, 1, 0);
    expect(result.nextMax).toBeGreaterThanOrEqual(VOICE_QUEUE_MAX_FLOOR);
  });
});
