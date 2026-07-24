/**
 * voiceLagBudget.js — 会場読み上げの件数ゲート実効上限を、処理時間EMA(実測)から動的に
 * 算出する純関数群(診断先行アプローチ)。
 *
 * 背景(council-fable 3段構え・venue-bubble-voice-realtime-max-DESIGN.md C-1章):
 *   会議の批判(gpt-oss-120b)が「VOICEVOXの合成レートは負荷変動で崩れる」と指摘。正確には
 *   件数ゲート(8件)が保証するラグ上界(8×1件あたり処理時間)の後者が実測上は無界で、
 *   CPU高負荷時に処理時間が伸びると上界が安全網(VOICE_STALE_MS_NORMAL=8000ms)を突き抜け、
 *   全stale→「最新1件だけ読む」の劣化ループに落ちうる。
 *
 *   対策は時間ゲートを触ることではなく(不可侵の鉄則3)、件数ゲート自身を実測処理時間で
 *   縮めること。決定論・FIFO・最古dropの原則(不可侵の鉄則4)を1つも壊さない。
 *
 *   経緯: v0.1.1180で段階0(shadow計測のみ・診断表示のみ)として導入。実配信で
 *   effectiveQueueMax<8(処理時間1703ms/件→実効上限3)が実際に観測されたため、
 *   v0.1.1181で段階1(apply)へ移行し、voicePlayer.jsのpushVoiceQueue呼び出しに実適用した。
 *
 * @module voiceLagBudget
 */

/** ラグ予算(ms)。安全網(VOICE_STALE_MS_NORMAL=8000ms)より必ず低く=件数ゲートが時間ゲートより
 *  先に効く(不可侵の鉄則4の順序を数値で固定)。voiceLagBudget.test.js で不等式を断言する。 */
export const VOICE_LAG_BUDGET_MS = 6000;

/** 実効上限の天井。8→12への引き上げは却下済み案のため、この値は変えない。 */
export const VOICE_QUEUE_MAX_CEIL = 8;

/** 実効上限の床。「今+次」は必ず読む=ゼロ音声防止(v0.1.781の教訓の構造化)。 */
export const VOICE_QUEUE_MAX_FLOOR = 2;

/** 復帰(縮小した上限を戻す)に必要な連続余裕回数。縮小は即時、復帰はヒステリシスを掛けて
 *  ばたつき(地雷G-2: anchored⇄dockピンポン v0.1.1128の同型再演)を防ぐ。 */
export const VOICE_GROW_STREAK_N = 5;

/**
 * 1件あたり処理時間のEMA(指数移動平均)を更新する。alpha=0.3はe2eAvgMsと同流儀。
 * @param {number} prevMs 直前のEMA値(未計測なら-1)
 * @param {number} sampleMs 今回のサンプル値(ms)
 * @param {number} [alpha]
 * @returns {number}
 */
export function updateVoiceServiceTimeEma(prevMs, sampleMs, alpha = 0.3) {
  const sample = Math.max(0, Number(sampleMs) || 0);
  const prev = Number(prevMs);
  if (!Number.isFinite(prev) || prev < 0) return sample;
  return prev + alpha * (sample - prev);
}

/**
 * ラグ予算と実測処理時間EMAから、あるべき実効上限を計算する純関数。
 * 未計測(-1以下)や0以下はfail-openでCEILを返す(データが無いうちは縮めない)。
 * @param {number} serviceTimeEmaMs
 * @returns {number}
 */
export function resolveVoiceQueueMax(serviceTimeEmaMs) {
  const ema = Number(serviceTimeEmaMs);
  if (!Number.isFinite(ema) || ema <= 0) return VOICE_QUEUE_MAX_CEIL;
  const raw = Math.floor(VOICE_LAG_BUDGET_MS / ema);
  return Math.min(VOICE_QUEUE_MAX_CEIL, Math.max(VOICE_QUEUE_MAX_FLOOR, raw));
}

/**
 * ヒステリシス付きで実効上限を1段ずつ遷移させる純関数。
 * 縮小(computedMax < currentMax)は即座に反映しgrowStreakを0にリセット。
 * 復帰(computedMax > currentMax)はgrowStreakを+1し、VOICE_GROW_STREAK_N回連続で
 * 余裕が続いたときだけ+1段だけ復帰する(一気にCEILへは戻さない)。
 * @param {number} currentMax 現在の実効上限
 * @param {number} computedMax resolveVoiceQueueMaxの計算結果
 * @param {number} growStreak 直近の連続「余裕あり」回数
 * @returns {{ nextMax: number, nextGrowStreak: number }}
 */
export function stepVoiceQueueMax(currentMax, computedMax, growStreak) {
  const current = Math.min(VOICE_QUEUE_MAX_CEIL, Math.max(VOICE_QUEUE_MAX_FLOOR, Math.floor(Number(currentMax) || VOICE_QUEUE_MAX_CEIL)));
  const computed = Math.min(VOICE_QUEUE_MAX_CEIL, Math.max(VOICE_QUEUE_MAX_FLOOR, Math.floor(Number(computedMax) || VOICE_QUEUE_MAX_CEIL)));
  const streak = Math.max(0, Math.floor(Number(growStreak) || 0));

  if (computed < current) {
    return { nextMax: computed, nextGrowStreak: 0 };
  }
  if (computed === current) {
    return { nextMax: current, nextGrowStreak: 0 };
  }
  // computed > current: 復帰方向。ヒステリシスを掛ける。
  const nextStreak = streak + 1;
  if (nextStreak >= VOICE_GROW_STREAK_N) {
    return { nextMax: Math.min(VOICE_QUEUE_MAX_CEIL, current + 1), nextGrowStreak: 0 };
  }
  return { nextMax: current, nextGrowStreak: nextStreak };
}
