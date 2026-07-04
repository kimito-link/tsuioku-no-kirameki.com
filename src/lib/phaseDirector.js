/**
 * phaseDirector.js
 * council/pachinko-ultimate-SYNTHESIS.md §3(物語弧=決定論ステートマシン)+§6 Phase C の実装。
 *
 * 「盛り上がりメーター(M・effectDirector.js の meterStateFor)」から、その配信自身の
 *   ベースライン(B)に対する相対比(R = M / max(B, B_floor))を求め、フェーズ(通常→煽り→
 *   リーチ→突破→大当たり→払い出し→通常)を決定論で遷移させる純関数層。
 *
 * 設計原則(§7 絶対制約と同じ):
 *   - 決定論のみ。乱数は一切使わない(同じ入力には常に同じ結果)。
 *   - 副作用ゼロ。DOM・storage・音の再生には一切触れない(呼び出し元=venueBar.js/popup-entry.jsが使う)。
 *   - 順位イベントはこの層に入力しない(§7「順位変動へのリーチ付与は禁止」)。
 *   - 降格・タイムアウトは無音(偽の解決音を鳴らさない)。
 */

/** ベースライン(B)のEMA半減期(ms)。10分で前回値と現在Mの差が半分になる(§3.2)。 */
export const BASELINE_HALF_LIFE_MS = 10 * 60_000;

/** ベースライン下限。無音配信でBが0近くまで落ちてRが過敏化するのを防ぐ(§3.2)。 */
export const BASELINE_FLOOR = 2.0;

/** 配信検知からのウォームアップ時間(ms)。この間はRを1.0に固定する(§3.2)。 */
export const WARMUP_MS = 3 * 60_000;

/**
 * @typedef {{ value: number, updatedAt: number, initialized: boolean }} BaselineState
 *   value: 現在のベースライン値。updatedAt: 最後に更新した時刻(epoch ms・0=未更新)。
 *   initialized: 一度でもbaselineForを通したか(false=次回呼び出しでMから初期化する)。
 */

/** 初期ベースライン state。 */
export function makeInitialBaselineState() {
  return { value: 0, updatedAt: 0, initialized: false };
}

/**
 * ベースライン(B)を1歩進める純関数(§3.2の式そのもの)。
 *   B ← B + (M − B) × (1 − 0.5^(dt/halfLife))。下限は呼び出し側(rFor)で適用する
 *   (state自体は生のEMA値を持ち、下限適用は表示/R計算の責務に分離=EMAの収束テストをそのまま書ける)。
 * @param {Partial<BaselineState>|null|undefined} prev 前回state(null=初期状態から)
 * @param {number} meterValue 現在のメーター値M
 * @param {number} dtMs 前回更新からの経過時間(ms)。初回(prev未設定)はdt無視してMそのものから開始しない
 *   (最初のtickでいきなりB=Mだと配信直後の一発でベースラインが跳ね上がるため、初回はB=meterValueで初期化)。
 * @returns {BaselineState}
 */
export function baselineFor(prev, meterValue, dtMs) {
  const p = prev && typeof prev === 'object' ? prev : null;
  const m = Number.isFinite(Number(meterValue)) ? Math.max(0, Number(meterValue)) : 0;
  const dt = Math.max(0, Number(dtMs) || 0);
  const hasPrev = !!p && p.initialized === true;
  const now = Math.max(0, Number(p?.updatedAt) || 0) + dt;
  if (!hasPrev) {
    // 初回: ベースラインをMから始める(いきなり0からだと最初のイベントでRが跳ね上がり誤爆する)。
    return { value: m, updatedAt: now, initialized: true };
  }
  const decay = Math.pow(0.5, dt / BASELINE_HALF_LIFE_MS);
  const prevValue = Math.max(0, Number(p.value) || 0);
  const value = prevValue + (m - prevValue) * (1 - decay);
  return { value: Math.max(0, value), updatedAt: now, initialized: true };
}

/**
 * 相対比 R = M / max(B, B_floor) を求める純関数(§3.2)。
 * @param {number} meterValue
 * @param {number} baselineValue
 * @returns {number}
 */
export function relativeRatio(meterValue, baselineValue) {
  const m = Number.isFinite(Number(meterValue)) ? Math.max(0, Number(meterValue)) : 0;
  const b = Number.isFinite(Number(baselineValue)) ? Number(baselineValue) : 0;
  return m / Math.max(b, BASELINE_FLOOR);
}

/**
 * ウォームアップ込みのR算出。配信検知から WARMUP_MS 未満は 1.0 固定(§3.2)。
 * @param {number} meterValue
 * @param {number} baselineValue
 * @param {number} elapsedSinceStreamDetectedMs 配信検知からの経過時間(ms)
 * @returns {number}
 */
export function rWithWarmup(meterValue, baselineValue, elapsedSinceStreamDetectedMs) {
  const elapsed = Number.isFinite(Number(elapsedSinceStreamDetectedMs))
    ? Number(elapsedSinceStreamDetectedMs)
    : Infinity;
  if (elapsed < WARMUP_MS) return 1.0;
  return relativeRatio(meterValue, baselineValue);
}

/* ============================================================================
 * フェーズ・ステートマシン(§3.3)
 * ========================================================================== */

/** フェーズの列挙(弱→強の順)。 */
export const PHASE = Object.freeze({
  NORMAL: 'normal',
  ATSUI: 'atsui', // 煽り
  REACH: 'reach', // リーチ
  BREAKTHROUGH: 'breakthrough', // 突破(遷移の瞬間のみ・すぐ大当たり/通常へ畳み込む想定)
  JACKPOT: 'jackpot', // 大当たり
  PAYOUT: 'payout' // 払い出し
});

/** フェーズごとの「in閾値」(そのフェーズに入るR条件・§3.3)。 */
const PHASE_IN_THRESHOLD = Object.freeze({
  [PHASE.ATSUI]: 1.5,
  [PHASE.REACH]: 2.5,
  [PHASE.BREAKTHROUGH]: 4.0
});

/** 降格ヒステリシス: in閾値からこの分だけ引いた値を「out閾値」とする(§3.3=0.5固定幅)。 */
const DEMOTE_HYSTERESIS_DELTA = 0.5;
/** 降格が確定するまでout閾値を下回り続けなければならない時間(ms・§3.3)。 */
const DEMOTE_HOLD_MS = 60_000;
/** リーチ滞在の強制タイムアウト(ms・§3.3「120秒上限」)。 */
export const REACH_MAX_DWELL_MS = 120_000;

/**
 * @typedef {{
 *   phase: string,                 // PHASE.* のいずれか
 *   enteredAt: number,             // 現フェーズに入った時刻(epoch ms)
 *   belowOutThresholdSinceMs: number, // out閾値を下回り続けている開始時刻(0=下回っていない)
 *   highestR: number,              // この配信でのR自己最高値(voice_max判定用に呼び出し側が使う)
 *   holdLampBand: number           // 直近にhold_lampを鳴らした帯(0=1.0未満,1=1.0台,2=1.5台,3=2.0台,4=2.5以上)
 *   holdLampBandAtMs: number       // holdLampBandに入った時刻(20秒CD判定用)
 * }} PhaseState
 */

/** 初期フェーズ state。 */
export function makeInitialPhaseState(nowMs = 0) {
  return {
    phase: PHASE.NORMAL,
    enteredAt: Number(nowMs) || 0,
    belowOutThresholdSinceMs: 0,
    highestR: 0,
    holdLampBand: 0,
    holdLampBandAtMs: 0
  };
}

/**
 * @typedef {{
 *   milestoneApproach?: boolean,    // 節目まで残り≤10%(§3.3「節目接近リーチ」)
 *   milestoneHit500?: boolean,      // 節目500到達の瞬間
 *   milestoneHit1000Plus?: boolean, // 節目1000以上到達の瞬間
 *   giftLargeOrAbove?: boolean,     // gift_large/mega相当のギフトが今回来た
 *   giftMega?: boolean,             // gift_mega(直撃/コンボ昇格の結果)
 *   comboStreak?: number,           // 現在のコンボ継続数(effectDirector.directHit の comboCount)
 *   payoutChainDone?: boolean       // 大当たりチェーン(SE→voice→payout)が完了した合図
 * }} PhaseEvents
 */

/**
 * @typedef {{
 *   phase: string,
 *   changed: boolean,               // このtickでフェーズが変わったか
 *   silent: boolean,                // changed===trueのとき、無音遷移(降格/タイムアウト)か
 *   holdLampFired: boolean,         // hold_lampを鳴らすべきか(§3.3)
 *   nextState: PhaseState
 * }} PhaseTransitionResult
 */

/**
 * Rの帯(1.0/1.5/2.0/2.5)を求める。hold_lampの「上向きに跨いだ瞬間」判定に使う。
 * @param {number} r
 * @returns {number}
 */
function bandForR(r) {
  if (r >= 2.5) return 4;
  if (r >= 2.0) return 3;
  if (r >= 1.5) return 2;
  if (r >= 1.0) return 1;
  return 0;
}

/** hold_lamp再発火の同帯クールダウン(ms・§3.3「同帯20秒CD」)。 */
const HOLD_LAMP_BAND_COOLDOWN_MS = 20_000;

/**
 * フェーズ遷移を1歩進める純関数(§3.3の遷移表の完全実装)。
 *   決定論: 同じ(state, R, events, nowMs)には常に同じ結果を返す。
 * @param {Partial<PhaseState>|null|undefined} state 前回state(null=初期状態から)
 * @param {number} R 相対比(rWithWarmupの結果)
 * @param {PhaseEvents} events このtickでのイベント合図(既定は全てfalse/0)
 * @param {number} nowMs 現在時刻(epoch ms)
 * @returns {PhaseTransitionResult}
 */
export function phaseFor(state, R, events, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const r = Number.isFinite(Number(R)) ? Number(R) : 0;
  const ev = events && typeof events === 'object' ? events : {};
  const s = state && typeof state === 'object' ? state : makeInitialPhaseState(now);
  const phase = String(s.phase || PHASE.NORMAL);
  const enteredAt = Number(s.enteredAt) || now;
  const highestR = Math.max(Number(s.highestR) || 0, r);

  // hold_lamp: 帯を上向きに跨いだ瞬間のみ+同帯20秒CD(降格による下向きは対象外)。
  const prevBand = Number(s.holdLampBand) || 0;
  const curBand = bandForR(r);
  let holdLampFired = false;
  let holdLampBand = prevBand;
  let holdLampBandAtMs = Number(s.holdLampBandAtMs) || 0;
  if (curBand > prevBand && curBand > 0) {
    const bandAgeOk = holdLampBandAtMs === 0 || now - holdLampBandAtMs >= HOLD_LAMP_BAND_COOLDOWN_MS;
    if (bandAgeOk) {
      holdLampFired = true;
      holdLampBand = curBand;
      holdLampBandAtMs = now;
    } else {
      holdLampBand = curBand; // CD中でも帯記録は更新(次の上昇判定を正しくする)
    }
  } else if (curBand !== prevBand) {
    holdLampBand = curBand; // 下向きは無音で帯だけ更新
  }

  /** @type {PhaseState} */
  const baseNext = {
    phase,
    enteredAt,
    belowOutThresholdSinceMs: Number(s.belowOutThresholdSinceMs) || 0,
    highestR,
    holdLampBand,
    holdLampBandAtMs
  };

  /** @param {string} nextPhase @param {boolean} silent */
  const transition = (nextPhase, silent) => ({
    phase: nextPhase,
    changed: true,
    silent,
    holdLampFired,
    nextState: {
      ...baseNext,
      phase: nextPhase,
      enteredAt: now,
      belowOutThresholdSinceMs: 0
    }
  });
  const stay = () => ({
    phase,
    changed: false,
    silent: false,
    holdLampFired,
    nextState: { ...baseNext, belowOutThresholdSinceMs: s.belowOutThresholdSinceMs || 0 }
  });

  // 払い出し→通常: 呼び出し側がpayoutChainDone合図を明示するまで留まる(BGM/フィーバー管理はbgmDirector側)。
  if (phase === PHASE.PAYOUT) {
    if (ev.payoutChainDone) return transition(PHASE.NORMAL, false); // フィーバー終了=通常へ(音は呼び出し側が§5で鳴らす)
    return stay();
  }

  // 大当たり→払い出し: 大当たり音の終了後、自動チェーンとして即座に払い出しへ(§3.3)。
  if (phase === PHASE.JACKPOT) {
    return transition(PHASE.PAYOUT, false); // payout SEは呼び出し側が鳴らす(この層は状態遷移のみ)
  }

  // 突破→大当たり(§3.3): 節目1000+/gift_mega/directHit昇格結果がjackpot・mega。
  if (phase === PHASE.BREAKTHROUGH) {
    if (ev.milestoneHit1000Plus || ev.giftMega) return transition(PHASE.JACKPOT, false);
    return stay(); // 突破自体は一瞬の遷移フェーズ=イベントが来るまで留まる(無限に居座らない設計は呼び出し側のevents供給で保証)
  }

  // リーチ→突破(§3.3): R≥4.0 / 節目500到達 / gift_large以上 / コンボ3連目。
  if (phase === PHASE.REACH) {
    const comboStreak = Math.max(0, Math.floor(Number(ev.comboStreak) || 0));
    if (r >= PHASE_IN_THRESHOLD[PHASE.BREAKTHROUGH] || ev.milestoneHit500 || ev.giftLargeOrAbove || comboStreak >= 3) {
      return transition(PHASE.BREAKTHROUGH, false);
    }
    // リーチ滞在上限120秒: 突破に届かなければ無音で通常へ(§3.3)。
    if (now - enteredAt >= REACH_MAX_DWELL_MS) {
      return transition(PHASE.NORMAL, true);
    }
    // 降格ヒステリシス: in閾値-0.5を60秒継続で無音降格。
    const outThreshold = PHASE_IN_THRESHOLD[PHASE.REACH] - DEMOTE_HYSTERESIS_DELTA;
    return applyDemoteHysteresis(s, r, outThreshold, now, PHASE.ATSUI, baseNext, holdLampFired);
  }

  // 煽り→リーチ(§3.3): R≥2.5 / 節目接近(残り≤10%) / コンボ2連中。
  if (phase === PHASE.ATSUI) {
    const comboStreak = Math.max(0, Math.floor(Number(ev.comboStreak) || 0));
    if (r >= PHASE_IN_THRESHOLD[PHASE.REACH] || ev.milestoneApproach || comboStreak >= 2) {
      return transition(PHASE.REACH, false);
    }
    const outThreshold = PHASE_IN_THRESHOLD[PHASE.ATSUI] - DEMOTE_HYSTERESIS_DELTA;
    return applyDemoteHysteresis(s, r, outThreshold, now, PHASE.NORMAL, baseNext, holdLampFired);
  }

  // 通常→煽り(§3.3): R≥1.5。
  if (r >= PHASE_IN_THRESHOLD[PHASE.ATSUI]) {
    return transition(PHASE.ATSUI, false);
  }
  return stay();
}

/**
 * 降格ヒステリシス(in閾値-0.5を60秒継続で1段降格・§3.3)の共通処理。
 * @param {Partial<PhaseState>} s
 * @param {number} r
 * @param {number} outThreshold
 * @param {number} now
 * @param {string} demoteToPhase
 * @param {PhaseState} baseNext
 * @param {boolean} holdLampFired
 * @returns {PhaseTransitionResult}
 */
function applyDemoteHysteresis(s, r, outThreshold, now, demoteToPhase, baseNext, holdLampFired) {
  const phase = String(s.phase);
  if (r < outThreshold) {
    const since = Number(s.belowOutThresholdSinceMs) || 0;
    const startedAt = since > 0 ? since : now;
    if (now - startedAt >= DEMOTE_HOLD_MS) {
      return {
        phase: demoteToPhase,
        changed: true,
        silent: true,
        holdLampFired,
        nextState: { ...baseNext, phase: demoteToPhase, enteredAt: now, belowOutThresholdSinceMs: 0 }
      };
    }
    return {
      phase,
      changed: false,
      silent: false,
      holdLampFired,
      nextState: { ...baseNext, belowOutThresholdSinceMs: startedAt }
    };
  }
  // out閾値以上に戻った=降格タイマーをリセット。
  return {
    phase,
    changed: false,
    silent: false,
    holdLampFired,
    nextState: { ...baseNext, belowOutThresholdSinceMs: 0 }
  };
}
