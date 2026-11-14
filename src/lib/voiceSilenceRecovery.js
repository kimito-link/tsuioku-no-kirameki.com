/**
 * 【層】L0 判定層(ブラウザI/Oは呼び出し側へ委譲)
 * 【この箱に入るもの】無音監視の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* の直接操作
 * 【書けるstorageキー】なし
 * 【正本宣言】無音監視の判定 の判断根拠はこのファイルのみ
 */
// voiceSilenceRecovery.js — 読み上げ ON でコメントが届き続けるのに無音になった時の自己復旧判定。
// DOM/chrome.* 非依存。VoicePlayer はこの純関数の答えに従って詰まった処理を捨てる。

/** 20秒以上の無音を作らないため、タイマー/イベント遅延の2秒前に自己復旧する。 */
export const VOICE_SILENCE_RECOVERY_MS = 18000;

/**
 * @typedef {'synth-stall'|'playback-stall'|'queue-stall'|'silent-input'|''} VoiceSilenceRecoveryReason
 */

/**
 * @param {{
 *   enabled?: boolean,
 *   nowMs?: number,
 *   lastInputAt?: number,
 *   silenceStartedAt?: number,
 *   lastAudibleAt?: number,
 *   lastRecoveryAt?: number,
 *   playing?: boolean,
 *   audioStarted?: boolean,
 *   synthInFlight?: number,
 *   queueLength?: number
 * }} s
 * @returns {{ recover: boolean, silentMs: number, reason: VoiceSilenceRecoveryReason }}
 */
export function planVoiceSilenceRecovery(s) {
  if (s?.enabled !== true) return { recover: false, silentMs: 0, reason: '' };
  const now = Number(s.nowMs);
  const input = Number(s.lastInputAt);
  if (!Number.isFinite(now) || !(input > 0) || now < input) return { recover: false, silentMs: 0, reason: '' };
  const audible = Number(s.lastAudibleAt) > 0 ? Number(s.lastAudibleAt) : 0;
  const recovery = Number(s.lastRecoveryAt) > 0 ? Number(s.lastRecoveryAt) : 0;
  const started = Number(s.silenceStartedAt) > 0 ? Number(s.silenceStartedAt) : input;
  // 最後に鳴った/立て直した後に届いたコメントだけを対象にする。静かな配信では発火しない。
  const base = Math.max(audible, recovery);
  if (input <= base) return { recover: false, silentMs: Math.max(0, now - base), reason: '' };
  // 初回は最初の対象コメント、発話/復旧後はその時刻から数える。直近入力で時計を戻さない。
  const effectiveSilentMs = Math.max(0, now - Math.max(base, started));
  if (effectiveSilentMs < VOICE_SILENCE_RECOVERY_MS) {
    return { recover: false, silentMs: effectiveSilentMs, reason: '' };
  }
  /** @type {VoiceSilenceRecoveryReason} */
  let reason = 'silent-input';
  if (Number(s.synthInFlight) > 0 || (s.playing === true && s.audioStarted !== true)) reason = 'synth-stall';
  else if (s.playing === true && s.audioStarted === true) reason = 'playback-stall';
  else if (Number(s.queueLength) > 0) reason = 'queue-stall';
  return { recover: true, silentMs: effectiveSilentMs, reason };
}
