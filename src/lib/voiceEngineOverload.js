// voiceEngineOverload.js — VOICEVOX が混みすぎて合成が時間切れを続けるときの切り替え(純関数)。
//
// 背景(2026-10-31 りんくの PC・v0.1.1843・来場8,737/コメ+86/分):
//   読み上げ ON なのに何も聞こえなかった。実測でエンジンは CPU モード(--use_gpu 無し)・CPU 99%、
//   audio_query だけで 2〜7秒・synthesis が 4〜10秒。合成は 8秒で打ち切るので、ほぼ全件が時間切れ
//   (null)で捨てられていた。しかも先読みで同時に最大3件頼むため、エンジンを取り合ってさらに遅くなる。
//   時間切れは「遅いPC」の物差し(recordVoiceSynthStage は成功した合成だけ数える)にも乗らないので、
//   何も切り替わらずに無音が続いた。
//
// 方針: 時間切れが続いたら「混雑中」とみなし、
//   ・同時に頼むのは1件だけ(取り合いで全部が時間切れになるのを止める)
//   ・打ち切りまでを長めにする(遅くても最後まで作って鳴らす=無音より遅れて聞こえる方がよい)
//   速く作れる合成が続いたら元に戻す(GPU に切り替えた・負荷が下がった時)。

/** これだけ時間切れが続いたら混雑中とみなす。 */
export const VOICE_OVERLOAD_TIMEOUT_STREAK = 2;

/** 混雑中、これだけ速い合成が続いたら戻す。 */
export const VOICE_OVERLOAD_RECOVER_STREAK = 5;

/** 「速い合成」とみなす上限(ms・頼んでから声ができるまで)。 */
export const VOICE_OVERLOAD_FAST_MS = 3000;

/** 混雑中の打ち切り(ms)。実測の最悪(問い合わせ7秒・合成10秒)が収まる長さ。 */
// 2026-11-03: 15/20秒→30/45秒。実測で混雑中の audio_query が平均11.7秒・合成が25秒かかり、
//   打ち切った依頼も VOICEVOX は最後まで計算して次を遅らせていた。混雑中は1件ずつしか頼まないので長く待つ。
export const VOICE_OVERLOAD_QUERY_TIMEOUT_MS = 30000;
export const VOICE_OVERLOAD_SYNTH_TIMEOUT_MS = 45000;

/**
 * 2026-11-13: 混雑中のまま、これだけ経ったら一度 VOICEVOX に戻して試す(ms)。
 *   2026-11-13 PC 実測(0.1.2114・雑談配信): 5分目から最後まで Windows の声のままで、VOICEVOX の
 *   合成が1件も無かった。戻るのは「確かめ5回続けて3秒未満」だけで、読み上げ中の「てすと」は最大2.4秒と
 *   線に近い。どんな理由でも「ずっと戻らない」を起こさないよう、時間で一度は試す(また2回時間切れなら軽い声へ)。
 */
export const VOICE_OVERLOAD_MAX_STUCK_MS = 120000;

/** @returns {{ overloaded: boolean, timeoutStreak: number, fastStreak: number, overloadedAt: number }} */
export function createVoiceOverloadState() {
  return { overloaded: false, timeoutStreak: 0, fastStreak: 0, overloadedAt: 0 };
}

/**
 * 混雑中のまま VOICE_OVERLOAD_MAX_STUCK_MS 経っていたら、混雑を解いて VOICEVOX を一度試す。
 * @param {{ overloaded: boolean, timeoutStreak: number, fastStreak: number, overloadedAt?: number } | null | undefined} state
 * @param {number} nowMs
 * @returns {boolean} 解いたら true
 */
export function retryVoiceEngineAfterLongOverload(state, nowMs) {
  if (!state || !state.overloaded) return false;
  const at = Number(state.overloadedAt);
  const now = Number(nowMs);
  if (!(at > 0) || !Number.isFinite(now) || now - at < VOICE_OVERLOAD_MAX_STUCK_MS) return false;
  state.overloaded = false;
  state.timeoutStreak = 0;
  state.fastStreak = 0;
  state.overloadedAt = 0;
  return true;
}

/**
 * 合成1件の結果を足す。state を書き換え、混雑中かどうかを返す。
 * @param {{ overloaded: boolean, timeoutStreak: number, fastStreak: number, overloadedAt?: number }} state
 * @param {{ timedOut?: boolean, ok?: boolean, totalMs?: number }} outcome
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function noteVoiceSynthOutcome(state, outcome, nowMs = Date.now()) {
  if (!state) return false;
  if (outcome?.timedOut === true) {
    state.timeoutStreak += 1;
    state.fastStreak = 0;
    if (state.timeoutStreak >= VOICE_OVERLOAD_TIMEOUT_STREAK && !state.overloaded) {
      state.overloaded = true;
      state.overloadedAt = Number(nowMs) || Date.now();
    }
    return state.overloaded;
  }
  if (outcome?.ok !== true) return state.overloaded; // 時間切れ以外の失敗(接続できない等)は混雑の証拠にしない
  state.timeoutStreak = 0;
  const ms = Number(outcome?.totalMs);
  if (Number.isFinite(ms) && ms >= 0 && ms < VOICE_OVERLOAD_FAST_MS) {
    state.fastStreak += 1;
    if (state.overloaded && state.fastStreak >= VOICE_OVERLOAD_RECOVER_STREAK) {
      state.overloaded = false;
      state.overloadedAt = 0;
    }
  } else {
    state.fastStreak = 0;
  }
  return state.overloaded;
}

/**
 * 合成に渡す打ち切り。混雑中だけ長くする(それ以外は呼び出し側の既定のまま)。
 * @param {boolean} overloaded
 * @returns {{ audioQueryTimeoutMs?: number, synthesisTimeoutMs?: number }}
 */
export function resolveVoiceOverloadTimeouts(overloaded) {
  if (!overloaded) return {};
  return {
    audioQueryTimeoutMs: VOICE_OVERLOAD_QUERY_TIMEOUT_MS,
    synthesisTimeoutMs: VOICE_OVERLOAD_SYNTH_TIMEOUT_MS
  };
}

/**
 * 先読みの深さ。混雑中は1件だけ(今読む分しか頼まない)。
 * @param {number} depth resolveVoiceSynthDepth の結果
 * @param {boolean} overloaded
 * @returns {number}
 */
export function capVoiceSynthDepthForOverload(depth, overloaded) {
  const d = Number(depth);
  if (!Number.isFinite(d)) return overloaded ? 1 : 0;
  return overloaded ? Math.min(d, 1) : d;
}
