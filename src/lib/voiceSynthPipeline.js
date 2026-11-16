/**
 * 【層】L0 判定層
 * 【この箱に入るもの】合成先読みの上限と処理能力に応じた増減
 * 【この箱に入らないもの】fetch / storage / DOM / タイマー
 * 【書けるstorageキー】なし
 * 【正本宣言】適応先読みの上限と増減はこのファイルで決める
 */
export const VOICE_PIPELINE_MAX_INFLIGHT = 24;
export const VOICE_PIPELINE_MAX_PENDING = 32;
export const VOICE_PIPELINE_MAX_AGE_MS = 20000;
export const VOICE_PIPELINE_FILL_WAIT_MS = 18000;
const COOLDOWN_MS = 60000;

export function createVoicePipelineState() {
  return { limit: 1, maxInflight: 6, synthMs: 0, rate: 0, epochAt: 0, completed: 0, cooldownUntil: 0, blockedUntil: 0, trial: false };
}

/** 依頼を始めた時点。時刻は呼出側から渡すので時計・タイマーへの依存を持たない。 */
/** @param {ReturnType<typeof createVoicePipelineState>} state @param {number} nowMs */
export function noteVoicePipelineStart(state, nowMs) {
  if (!(state.epochAt > 0)) state.epochAt = nowMs;
  return state.limit;
}

/**
 * 全依頼が並行に進む環境だけ増やす。CPU内で直列化される環境は、
 * 同じ件数が終わるまでの実時間が改善しないため減らす。未完了を成功と数えない。
 * @param {any} state
 * @param {{ok:boolean,totalMs?:number,limit:number,nowMs:number,arrivalPerMin?:number,aborted?:boolean,uncertain?:boolean}} result
 */
export function noteVoicePipelineResult(state, result) {
  if (result.aborted) return;
  const ms = Number(result.totalMs);
  if (!result.ok) {
    if (!result.uncertain) return; // 1件の400/不正データはCPU混雑の証拠ではない
    state.limit = Math.max(1, Math.floor(state.limit / 2));
    state.cooldownUntil = result.nowMs + COOLDOWN_MS;
    state.blockedUntil = result.nowMs + 75000;
    state.trial = false;
    state.rate = 0;
    state.epochAt = 0;
    state.completed = 0;
    return;
  }
  if (!(ms > 0) || !Number.isFinite(ms)) return;
  state.synthMs = state.synthMs > 0 ? state.synthMs * 0.75 + ms * 0.25 : ms;
  if (!(state.epochAt > 0)) return; // 新しい観測窓を開始する前の結果は数えない
  state.completed += 1;
  if (state.completed < state.limit) return;
  // 旧上限の依頼も実資源を占有するため窓内の実完了へ含める。
  // 旧依頼が一度に完了しても、そのraw所要時間を分母の床にして瞬間burstで増枠しない。
  const elapsed = Math.max(ms, result.nowMs - state.epochAt, 1);
  const rate = state.completed * 1000 / elapsed;
  const arrival = Number(result.arrivalPerMin);
  const demand = Number.isFinite(arrival) && arrival > 0
    ? Math.ceil(arrival * state.synthMs / 60000 * 1.2) : 1;
  const improved = !(state.rate > 0) || rate >= state.rate * (state.trial ? 1.12 : 0.65);
  if (state.limit > 1 && !improved) {
    state.limit = Math.max(1, Math.floor(state.limit / 2));
    state.trial = false;
    state.cooldownUntil = result.nowMs + COOLDOWN_MS;
  } else if (result.nowMs >= state.cooldownUntil && demand > state.limit) {
    const next = Math.min(state.maxInflight, state.limit * 2);
    state.trial = next > state.limit;
    state.limit = next;
  }
  if (improved && state.limit === result.limit) state.trial = false;
  state.rate = rate;
  state.epochAt = 0;
  state.completed = 0;
}

/** @param {{limit:number}} state */
export function voicePipelinePendingLimit(state) {
  return Math.min(VOICE_PIPELINE_MAX_PENDING, Math.max(8, state.limit * 2));
}

/** @param {ReturnType<typeof createVoicePipelineState>} state @param {unknown} value */
export function setVoicePipelineCapacity(state,value) {
 const cap=Number(value);state.maxInflight=Number.isInteger(cap)&&cap>=1&&cap<=VOICE_PIPELINE_MAX_INFLIGHT?cap:6;
 if(state.limit>state.maxInflight){state.limit=state.maxInflight;state.rate=0;state.epochAt=0;state.completed=0;state.trial=false;}
}
