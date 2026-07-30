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

// ---------------------------------------------------------------------------
// 2026-07-28(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md):
//   「読み上げが遅い」体感の真因診断。会議は「コメント流量に処理時間が構造的に追いつけない
//   (仮説A=再生時間支配)」と結論したが、Fableが実コード(_drainQueueは直列await1本サーバ)を
//   読み「実効上限はスループットに寄与しない」と検算を訂正した上で、混雑ヒューリスティクス
//   (computeVoiceCongestion/resolveVoiceSynthDepth)が絶対キュー長依存のため実効上限が
//   絞られたレジームで「先読み深さ1→合成が再生と重ならず毎件コールドスタート→処理時間が
//   伸びる→実効上限がさらに絞られる」という自己強化ループ(仮説B)を起こしている疑いを発見。
//   この節はその真因(A/B/C)を実測から判別する純関数群。段階0=印字のみ・挙動には一切介入しない。
// ---------------------------------------------------------------------------

/** 需要/供給比(pressure=λ×S/60000)がこれ以下なら「過負荷ではない」とみなす閾値。EMA振れの誤差帯。 */
export const VOICE_PRESSURE_OK_MAX = 1.2;

/** 合成待ち(synthWaitEmaMs)がserviceTimeEmaMsに占める比率がこれ以上なら「合成の重なりが
 *  失われている」とみなす閾値(仮説B=coldsynthの検出条件の一部)。 */
export const VOICE_SYNTH_WAIT_DOMINANT_RATIO = 0.35;

/** 期待再生時間(expectedPlayEmaMs)がserviceTimeEmaMsに占める比率がこれ以上なら「再生時間が
 *  処理時間の大部分を占める」とみなす閾値(仮説A=playbackの検出条件)。 */
export const VOICE_PLAYBACK_DOMINANT_RATIO = 0.6;

/** 実再生時間(playbackEmaMs)が期待再生時間(expectedPlayEmaMs)よりserviceTimeEmaMs比でこれ以上
 *  超過していれば「再生ストール」とみなす閾値(バッファ待ち・デバイス起因の疑い)。 */
export const VOICE_STALL_EXCESS_RATIO = 0.2;

/**
 * 発話成功/dropのイベント列を二項EMAで均し、「直近voiced率」を得る純関数。
 * 累計voicedRatio(spokenTotal/(spokenTotal+staleDropTotal))は配信開始からの累計で、
 * リロード跨ぎや序盤の少数サンプルにバイアスされやすい(実測で62.1%→3.8%の急落を観測)。
 * alpha=0.05は「直近30件程度で均す」狙いの小さめの値(体感遅延のe2eAvgMsのalpha=0.3より慎重)。
 * @param {unknown} prevRatio 直前のEMA値(-1=未計測)
 * @param {unknown} hit 発話成功なら1、dropなら0
 * @param {number} [alpha]
 * @returns {number} 更新後のEMA値(0〜1)。不正なhitは直前値をそのまま返す(壊れない)。
 */
export function updateVoiceEventRatioEma(prevRatio, hit, alpha = 0.05) {
  const h = Number(hit);
  if (h !== 0 && h !== 1) {
    const prev = Number(prevRatio);
    return Number.isFinite(prev) ? prev : -1;
  }
  const prev = Number(prevRatio);
  if (!Number.isFinite(prev) || prev < 0) return h;
  return prev + alpha * (h - prev);
}

/**
 * 到着件数を固定windowMs(既定10秒)で畳み、「件/分」のEMAへ変換する純関数。
 * enqueueはバッチで来るため同一Date.now()が並ぶことがあり、到着"間隔"のEMA(gap-EMA)は
 * gap=0連発で崩壊する。窓を閉じたタイミングでその窓の件数を「件/分」換算してEMA化する。
 * @param {{ windowStartMs?: number, windowCount?: number, arrivalPerMin?: number }|null|undefined} state
 * @param {number} nowMs
 * @param {number} [count] 今回追加する到着件数(既定1)
 * @param {number} [windowMs] 窓の長さ(既定10000ms)
 * @param {number} [alpha] EMA係数(既定0.3)
 * @returns {{ windowStartMs: number, windowCount: number, arrivalPerMin: number }}
 */
export function foldVoiceArrivalWindow(state, nowMs, count = 1, windowMs = 10000, alpha = 0.3) {
  const now = Number(nowMs);
  const safeNow = Number.isFinite(now) ? now : 0;
  const addCount = Math.max(0, Math.floor(Number(count) || 0));
  const s = state && typeof state === 'object' ? state : {};
  const prevStart = Number(s.windowStartMs);
  const prevCount = Math.max(0, Math.floor(Number(s.windowCount) || 0));
  const prevRate = Number(s.arrivalPerMin);

  if (!Number.isFinite(prevStart)) {
    // 初回: 窓を開始するだけ(まだレートは確定させない)。
    return { windowStartMs: safeNow, windowCount: addCount, arrivalPerMin: Number.isFinite(prevRate) && prevRate >= 0 ? prevRate : -1 };
  }

  const elapsed = safeNow - prevStart;
  if (elapsed < windowMs) {
    // 窓の途中: 件数だけ積む。
    return { windowStartMs: prevStart, windowCount: prevCount + addCount, arrivalPerMin: Number.isFinite(prevRate) && prevRate >= 0 ? prevRate : -1 };
  }

  // 窓を閉じる: 今回分も含めたこの窓の件数を「件/分」に換算してEMA化し、新しい窓を開始する。
  const closedCount = prevCount + addCount;
  const safeElapsed = Math.max(1, elapsed); // 0除算防止(理論上elapsed>=windowMs>0なので到達しないがfail-safe)。
  const sampleRate = (closedCount * 60000) / safeElapsed;
  const nextRate = !Number.isFinite(prevRate) || prevRate < 0 ? sampleRate : prevRate + alpha * (sampleRate - prevRate);
  return { windowStartMs: safeNow, windowCount: 0, arrivalPerMin: nextRate };
}

/**
 * serviceTimeの内訳(合成待ち/期待再生時間/実再生時間)と需要/供給から、体感遅延の真因トークンを
 * 判定する純関数。段階0=shadow専用。この関数の戻り値で挙動(キュー制御・混雑ヒューリスティクス)を
 * 変えてはならない(印字のみ)。真理値表はvoiceLagBudget.test.jsで全トークンを固定する。
 *
 * @param {{
 *   serviceTimeEmaMs?: unknown, synthWaitEmaMs?: unknown, expectedPlayEmaMs?: unknown,
 *   playbackEmaMs?: unknown, arrivalPerMin?: unknown, effectiveQueueMax?: unknown,
 *   computedMax?: unknown, capLagTicks?: unknown, sampleCount?: unknown
 * }} inputs
 * @returns {'insufficient'|'ok'|'hysteresis'|'coldsynth'|'synthslow'|'stall'|'playback'|'mixed'}
 */
export function computeVoiceLagVerdict(inputs) {
  const i = inputs && typeof inputs === 'object' ? inputs : {};
  const S = Number(i.serviceTimeEmaMs);
  const W = Number(i.synthWaitEmaMs);
  const E = Number(i.expectedPlayEmaMs);
  const P = Number(i.playbackEmaMs);
  const L = Number(i.arrivalPerMin);
  const cap = Number(i.effectiveQueueMax);
  // computedMax自体はこの判定式では使わない(capLagTicksの算出は呼び出し側の責務。
  // D章の判定式が参照するのはcapLagTicksの値のみ)。inputsの受け口としてキーは許容する。
  const capLagTicks = Math.max(0, Math.floor(Number(i.capLagTicks) || 0));
  const sampleCount = Math.max(0, Math.floor(Number(i.sampleCount) || 0));

  if (!Number.isFinite(S) || S <= 0 || !Number.isFinite(L) || L <= 0 || sampleCount < 5) {
    return 'insufficient'; // データ不足で断定しない(fail-closed)。
  }

  const pressure = (L * S) / 60000;

  if (pressure <= VOICE_PRESSURE_OK_MAX) {
    if (capLagTicks >= 10) return 'hysteresis'; // 仮説C: 負荷が引いたのに上限が戻らない。
    return 'ok'; // 間引きは偶発。騒がない。
  }

  // 過負荷確定(pressure > OK_MAX)。
  const synthDominant = Number.isFinite(W) && W >= 0 && W / S >= VOICE_SYNTH_WAIT_DOMINANT_RATIO;
  if (synthDominant) {
    const capIsSmall = Number.isFinite(cap) && cap <= 3;
    return capIsSmall ? 'coldsynth' : 'synthslow';
  }
  if (Number.isFinite(P) && Number.isFinite(E) && (P - E) / S >= VOICE_STALL_EXCESS_RATIO) {
    return 'stall'; // バッファ/再生ストール。
  }
  if (Number.isFinite(E) && E >= 0 && E / S >= VOICE_PLAYBACK_DOMINANT_RATIO) {
    return 'playback'; // 仮説A確定: 再生時間支配=構造的供給不足。
  }
  return 'mixed';
}
