import { describe, it, expect } from 'vitest';
import { VOICE_STALE_MS_NORMAL } from './voiceAgeGate.js';
import {
  VOICE_LAG_BUDGET_MS,
  VOICE_QUEUE_MAX_CEIL,
  VOICE_QUEUE_MAX_FLOOR,
  VOICE_GROW_STREAK_N,
  VOICE_PRESSURE_OK_MAX,
  VOICE_SYNTH_WAIT_DOMINANT_RATIO,
  VOICE_PLAYBACK_DOMINANT_RATIO,
  VOICE_STALL_EXCESS_RATIO,
  updateVoiceServiceTimeEma,
  resolveVoiceQueueMax,
  stepVoiceQueueMax,
  updateVoiceEventRatioEma,
  foldVoiceArrivalWindow,
  computeVoiceLagVerdict,
  computeSustainedPressureBoost,
  mergeVoiceSpeedBoost,
  VOICE_SUSTAINED_PRESSURE_MIN
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

  it('VOICE_QUEUE_MAX_FLOORは4(v0.1.1246: 実測5847ms/件で床2に張り付き39%取りこぼし→わんコメ式に寄せて引き上げ)', () => {
    expect(VOICE_QUEUE_MAX_FLOOR).toBe(4);
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

  it('大きく詰まる(3000ms/件)でも床4で頭打ち(6000/3000=2 → 床4に切り上げ)', () => {
    expect(resolveVoiceQueueMax(3000)).toBe(4);
  });

  it('極端に詰まっても床(4)を下回らない', () => {
    expect(resolveVoiceQueueMax(60000)).toBe(VOICE_QUEUE_MAX_FLOOR);
  });

  // v0.1.1246: 実機実測値(ノートPC・2026-08-04)での回帰。旧床2ならここが2に落ち、
  //   677件中266件(39%)が捨てられていた。床4を下回らないことを実測値で固定する。
  it('実測5847ms/件(ノートPC実機)でも床4を保つ', () => {
    expect(resolveVoiceQueueMax(5847)).toBe(4);
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
    // v0.1.1246: 床が2→4になったので、床に張り付いた状態=4から始める(性質は不変=+1段ずつ)。
    const max = VOICE_QUEUE_MAX_FLOOR;
    const streak = VOICE_GROW_STREAK_N - 1;
    const result = stepVoiceQueueMax(max, 8, streak);
    expect(result.nextMax).toBe(VOICE_QUEUE_MAX_FLOOR + 1);
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

// ---------------------------------------------------------------------------
// 2026-07-28(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md):
//   体感遅延の真因診断(合成待ち/準備待ち/実再生の3分解+判定式)。
// ---------------------------------------------------------------------------

describe('updateVoiceEventRatioEma', () => {
  it('初回(prev=-1)はhitをそのまま採用', () => {
    expect(updateVoiceEventRatioEma(-1, 1)).toBe(1);
    expect(updateVoiceEventRatioEma(-1, 0)).toBe(0);
  });

  it('2回目以降はEMA(alpha=0.05既定)で平滑化される', () => {
    const next = updateVoiceEventRatioEma(0.8, 0, 0.5);
    // 0.8 + 0.5*(0-0.8) = 0.4
    expect(next).toBeCloseTo(0.4, 5);
  });

  it('hitが0/1以外なら直前値をそのまま返す(壊れない)', () => {
    expect(updateVoiceEventRatioEma(0.6, 'x')).toBe(0.6);
    expect(updateVoiceEventRatioEma(0.6, NaN)).toBe(0.6);
  });

  it('直前値が未計測(NaN)でhitも不正なら-1を返す', () => {
    expect(updateVoiceEventRatioEma(undefined, 'x')).toBe(-1);
  });
});

describe('foldVoiceArrivalWindow', () => {
  it('初回は窓を開始するだけでarrivalPerMinは未確定(-1)', () => {
    const state = foldVoiceArrivalWindow(null, 1000, 3);
    expect(state.windowStartMs).toBe(1000);
    expect(state.windowCount).toBe(3);
    expect(state.arrivalPerMin).toBe(-1);
  });

  it('窓の途中(elapsed<windowMs)は件数を積むだけでレートは変わらない', () => {
    const s1 = foldVoiceArrivalWindow(null, 0, 2);
    const s2 = foldVoiceArrivalWindow(s1, 3000, 4, 10000);
    expect(s2.windowStartMs).toBe(0);
    expect(s2.windowCount).toBe(6);
    expect(s2.arrivalPerMin).toBe(-1);
  });

  it('窓を閉じると件数を件/分に換算する(10秒で30件→180件/分)', () => {
    const s1 = foldVoiceArrivalWindow(null, 0, 29); // 窓の間に29件積む
    const s2 = foldVoiceArrivalWindow(s1, 10000, 1, 10000); // 10秒経過時にラスト1件→窓を閉じる(計30件)
    // 初回換算なのでEMAでなくsampleRateがそのまま採用される。
    expect(s2.arrivalPerMin).toBeCloseTo(180, 5);
    expect(s2.windowStartMs).toBe(10000);
    expect(s2.windowCount).toBe(0); // 窓を閉じた直後は新しい窓がcount=0から始まる。
  });

  it('2回目以降の窓閉じはEMA(alpha既定0.3)で平滑化される', () => {
    const s1 = foldVoiceArrivalWindow(null, 0, 29);
    const s2 = foldVoiceArrivalWindow(s1, 10000, 1, 10000); // 180件/分
    const s3 = foldVoiceArrivalWindow(s2, 20000, 10, 10000); // sample=60件/分
    // 180 + 0.3*(60-180) = 144
    expect(s3.arrivalPerMin).toBeCloseTo(144, 5);
  });

  it('バッチ到着(同一Date.now()連発)でも壊れない(gap-EMAでなく窓畳みのため)', () => {
    let state = null;
    const now = 5000;
    for (let i = 0; i < 5; i += 1) {
      state = foldVoiceArrivalWindow(state, now, 1, 10000);
    }
    expect(state.windowCount).toBe(5);
    expect(state.arrivalPerMin).toBe(-1); // まだ窓が閉じていないので未確定のまま(壊れない)。
  });

  it('countが不正でも0扱いで壊れない', () => {
    const state = foldVoiceArrivalWindow(null, 0, 'x');
    expect(state.windowCount).toBe(0);
  });
});

describe('computeVoiceLagVerdict(真理値表)', () => {
  const base = {
    serviceTimeEmaMs: 5769,
    synthWaitEmaMs: 0,
    expectedPlayEmaMs: 0,
    playbackEmaMs: 0,
    arrivalPerMin: 233.7,
    effectiveQueueMax: 2,
    computedMax: 2,
    capLagTicks: 0,
    sampleCount: 20
  };

  it('serviceTimeEmaMs<=0はinsufficient', () => {
    expect(computeVoiceLagVerdict({ ...base, serviceTimeEmaMs: -1 })).toBe('insufficient');
    expect(computeVoiceLagVerdict({ ...base, serviceTimeEmaMs: 0 })).toBe('insufficient');
  });

  it('arrivalPerMin<=0はinsufficient', () => {
    expect(computeVoiceLagVerdict({ ...base, arrivalPerMin: -1 })).toBe('insufficient');
    expect(computeVoiceLagVerdict({ ...base, arrivalPerMin: 0 })).toBe('insufficient');
  });

  it('sampleCount<5はinsufficient(データ不足で断定しない=fail-closed)', () => {
    expect(computeVoiceLagVerdict({ ...base, sampleCount: 4 })).toBe('insufficient');
    expect(computeVoiceLagVerdict({ ...base, sampleCount: 0 })).toBe('insufficient');
  });

  it('pressure<=1.2かつcapLagTicks<10ならok(間引きは偶発)', () => {
    // pressure = 10件/分 * 1000ms / 60000 = 0.167 <= 1.2
    const verdict = computeVoiceLagVerdict({ ...base, arrivalPerMin: 10, serviceTimeEmaMs: 1000, capLagTicks: 0 });
    expect(verdict).toBe('ok');
  });

  it('pressure<=1.2かつcapLagTicks>=10ならhysteresis(仮説C: 上限が戻らない)', () => {
    const verdict = computeVoiceLagVerdict({ ...base, arrivalPerMin: 10, serviceTimeEmaMs: 1000, capLagTicks: 10 });
    expect(verdict).toBe('hysteresis');
  });

  it('過負荷+W/S>=0.35+cap<=3はcoldsynth(仮説B実体: 上限縮小の自己強化ループ)', () => {
    // pressure = 233.7*5769/60000 ≈ 22.5 > 1.2
    const verdict = computeVoiceLagVerdict({ ...base, synthWaitEmaMs: 3000, effectiveQueueMax: 2 });
    expect(verdict).toBe('coldsynth');
  });

  it('過負荷+W/S>=0.35+cap>3はsynthslow(VOICEVOX自体が遅い。Bではない)', () => {
    const verdict = computeVoiceLagVerdict({ ...base, synthWaitEmaMs: 3000, effectiveQueueMax: 6 });
    expect(verdict).toBe('synthslow');
  });

  it('過負荷+(P-E)/S>=0.2はstall(バッファ/再生ストール)', () => {
    const verdict = computeVoiceLagVerdict({
      ...base, synthWaitEmaMs: 0, expectedPlayEmaMs: 1000, playbackEmaMs: 1000 + 5769 * 0.2 + 100
    });
    expect(verdict).toBe('stall');
  });

  it('過負荷+E/S>=0.6はplayback(仮説A確定: 再生時間支配=構造的供給不足)', () => {
    const verdict = computeVoiceLagVerdict({
      ...base, synthWaitEmaMs: 0, expectedPlayEmaMs: 5769 * 0.7, playbackEmaMs: 5769 * 0.7
    });
    expect(verdict).toBe('playback');
  });

  it('過負荷だがどの条件にも当てはまらなければmixed', () => {
    const verdict = computeVoiceLagVerdict({
      ...base, synthWaitEmaMs: 0, expectedPlayEmaMs: 0, playbackEmaMs: 0
    });
    expect(verdict).toBe('mixed');
  });

  it('W/S判定はsynthWaitEmaMs未計測(NaN)ならsynthDominant扱いにしない', () => {
    const verdict = computeVoiceLagVerdict({
      ...base, synthWaitEmaMs: NaN, expectedPlayEmaMs: 5769 * 0.7, playbackEmaMs: 5769 * 0.7
    });
    expect(verdict).toBe('playback'); // coldsynth/synthslowに落ちずplaybackへ抜ける。
  });

  it('しきい値定数がDESIGN.mdどおりの値', () => {
    expect(VOICE_PRESSURE_OK_MAX).toBe(1.2);
    expect(VOICE_SYNTH_WAIT_DOMINANT_RATIO).toBe(0.35);
    expect(VOICE_PLAYBACK_DOMINANT_RATIO).toBe(0.6);
    expect(VOICE_STALL_EXCESS_RATIO).toBe(0.2);
  });
});

/**
 * v0.1.1222: 持続過負荷での速度底上げ。
 *
 * ★実測(2026-08-01 lv351083087)で踏んだ構造穴の回帰:
 *   実効上限が3に絞られるとキューは5件に届かず、computeVoiceCongestion の
 *   0.5/0.8段が【永久に発火しない】。速度で消化せず入口で捨てる方に倒れていた。
 */
describe('computeSustainedPressureBoost (v0.1.1222)', () => {
  it('データ不足なら0(静かなときに勝手に速くしない・fail-closed)', () => {
    expect(computeSustainedPressureBoost({ arrivalPerMin: 100, serviceTimeEmaMs: 1500, sampleCount: 4 })).toBe(0);
    expect(computeSustainedPressureBoost({})).toBe(0);
    expect(computeSustainedPressureBoost({ arrivalPerMin: 0, serviceTimeEmaMs: 1500, sampleCount: 50 })).toBe(0);
  });

  it('落ち着いていれば0(通常時の声の速さを変えない)', () => {
    // pressure = 20*1500/60000 = 0.5
    expect(computeSustainedPressureBoost({ arrivalPerMin: 20, serviceTimeEmaMs: 1500, sampleCount: 50 })).toBe(0);
  });

  /**
   * ★v0.1.1225 回帰: 実配信で「じわっと足りない」領域を取り逃がしていた2点を固定する。
   *   閾値1.5では下の2点とも 0.00/0.07 しか出ず、voiced率は67〜75%(3〜4件に1件読めない)。
   *   閾値を既存の判定境界(1.2)へ揃えたので、どちらでも実際に上乗せが立つ。
   */
  it('★実測: 需要23.8/分・処理3274ms(pressure≒1.30)で底上げが立つ', () => {
    const b = computeSustainedPressureBoost({
      arrivalPerMin: 23.8,
      serviceTimeEmaMs: 3274,
      sampleCount: 50
    });
    expect(b).toBeGreaterThan(0);
  });

  it('★実測: 需要31.8/分・処理2840ms(pressure≒1.51)では更に強く効く', () => {
    const weak = computeSustainedPressureBoost({
      arrivalPerMin: 23.8, serviceTimeEmaMs: 3274, sampleCount: 50
    });
    const strong = computeSustainedPressureBoost({
      arrivalPerMin: 31.8, serviceTimeEmaMs: 2840, sampleCount: 50
    });
    // 混むほど強くなる(単調)。旧閾値では 0.00 → 0.07 と、ほぼ差が付かなかった。
    expect(strong).toBeGreaterThan(weak);
  });

  it('閾値は「過負荷ではない」判定境界と同じ値(定義を揃える)', () => {
    expect(VOICE_SUSTAINED_PRESSURE_MIN).toBe(VOICE_PRESSURE_OK_MAX);
    // 境界ちょうどでは発火しない(誤差帯を過負荷と呼ばない)。
    expect(
      computeSustainedPressureBoost({ arrivalPerMin: 24, serviceTimeEmaMs: 3000, sampleCount: 50 })
    ).toBe(0);
  });

  it('★実測レジーム(需要102/分・1517ms/件)でブーストが立つ', () => {
    // pressure = 102.3*1517/60000 ≒ 2.59 → (2.59-1.5)*0.4 ≒ 0.43
    const b = computeSustainedPressureBoost({
      arrivalPerMin: 102.3,
      serviceTimeEmaMs: 1517,
      sampleCount: 50
    });
    expect(b).toBeGreaterThan(0.3);
    expect(b).toBeLessThanOrEqual(0.8);
  });

  it('極端な過負荷でも上限0.8を超えない(声質を守る)', () => {
    expect(
      computeSustainedPressureBoost({ arrivalPerMin: 1000, serviceTimeEmaMs: 3000, sampleCount: 99 })
    ).toBe(0.8);
  });

  it('決定論: 同じ入力は同じ値', () => {
    const args = { arrivalPerMin: 102.3, serviceTimeEmaMs: 1517, sampleCount: 50 };
    expect(computeSustainedPressureBoost(args)).toBe(computeSustainedPressureBoost(args));
  });
});

describe('mergeVoiceSpeedBoost (v0.1.1222)', () => {
  it('★下げない(既存の混雑ブーストを弱めない=間延び退行を作らない)', () => {
    expect(mergeVoiceSpeedBoost(0.8, 0)).toBe(0.8);
    expect(mergeVoiceSpeedBoost(0.5, 0.1)).toBe(0.5);
  });

  it('キュー長では出せない領域を持続ブーストが埋める', () => {
    // 実効上限3でキューが3件=congestion は 0.3 止まり。pressure 由来で 0.43 まで上げる。
    expect(mergeVoiceSpeedBoost(0.3, 0.43)).toBeCloseTo(0.43, 5);
  });

  it('上限で clamp する', () => {
    expect(mergeVoiceSpeedBoost(0.8, 0.8)).toBe(0.8);
  });

  it('不正値は0扱いで壊れない', () => {
    expect(mergeVoiceSpeedBoost(NaN, NaN)).toBe(0);
    expect(mergeVoiceSpeedBoost(undefined, 0.4)).toBeCloseTo(0.4, 5);
  });
});
