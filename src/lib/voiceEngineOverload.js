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
export const VOICE_OVERLOAD_QUERY_TIMEOUT_MS = 15000;
export const VOICE_OVERLOAD_SYNTH_TIMEOUT_MS = 20000;

/** @returns {{ overloaded: boolean, timeoutStreak: number, fastStreak: number }} */
export function createVoiceOverloadState() {
  return { overloaded: false, timeoutStreak: 0, fastStreak: 0 };
}

/**
 * 合成1件の結果を足す。state を書き換え、混雑中かどうかを返す。
 * @param {{ overloaded: boolean, timeoutStreak: number, fastStreak: number }} state
 * @param {{ timedOut?: boolean, ok?: boolean, totalMs?: number }} outcome
 * @returns {boolean}
 */
export function noteVoiceSynthOutcome(state, outcome) {
  if (!state) return false;
  if (outcome?.timedOut === true) {
    state.timeoutStreak += 1;
    state.fastStreak = 0;
    if (state.timeoutStreak >= VOICE_OVERLOAD_TIMEOUT_STREAK) state.overloaded = true;
    return state.overloaded;
  }
  if (outcome?.ok !== true) return state.overloaded; // 時間切れ以外の失敗(接続できない等)は混雑の証拠にしない
  state.timeoutStreak = 0;
  const ms = Number(outcome?.totalMs);
  if (Number.isFinite(ms) && ms >= 0 && ms < VOICE_OVERLOAD_FAST_MS) {
    state.fastStreak += 1;
    if (state.overloaded && state.fastStreak >= VOICE_OVERLOAD_RECOVER_STREAK) state.overloaded = false;
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
