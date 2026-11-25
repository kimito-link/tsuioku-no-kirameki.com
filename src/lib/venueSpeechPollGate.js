/**
 * venueSpeechPollGate.js — 会場の0.8秒ごとの発言読み(pollSpeech)で、storage の読み直しを省いてよいか(純関数)。
 *
 * ■ なぜ要るか(v0.1.2212・低スペックの PC で拡張と読み上げが固まらないように)
 *   会場はコメントのテール(最大 TAIL_MAX_ROWS=2,000行)を2つの道で受け取っている。
 *     1. chrome.storage.onChanged の newValue をその場で処理する(v0.1.756・速い道)
 *     2. 0.8秒ごとに storage から読み直す(保険・熱量の冷め・開く前に貯まったギフトpt)
 *   コメントが流れている間は1で届いた同じテールを2でも読み直し、全行を見直していた。
 *   ニコ生以外(SHOWROOM・YouTube など)は、読み直すたびに ytNicoShim が記録の組み立てまで走らせる。
 *   VOICEVOX を CPU で動かす PC では、この重なりがそのまま合成の遅れになる。
 * ■ どうするか
 *   直近 VENUE_SPEECH_PUSH_FRESH_MS 以内に1でテールが届いていれば、2の読み直しだけ省く。
 *   届かなくなれば(コメントが止まった・知らせが落ちた)次の回から今までどおり読む=保険は残る。
 *   15秒以上パネルの数字が来ていない(自己修復の読み)ときは省かない。
 * ■ 新しいタイマー・見張り・通信は足さない(既存の0.8秒の回の中で判定するだけ)。
 *
 * @module venueSpeechPollGate
 */

/** 会場の発言読みの間隔(venueBar.js の SPEECH_INTERVAL_MS と同じ値)。 */
export const VENUE_SPEECH_POLL_INTERVAL_MS = 800;

/** テールが直接届いてからこの時間は、同じテールを読み直さない(読みの回3回ぶん)。 */
export const VENUE_SPEECH_PUSH_FRESH_MS = VENUE_SPEECH_POLL_INTERVAL_MS * 3;

/**
 * @param {{ nowMs: number, lastPushAt: number, panelRefreshDue?: boolean }} s
 *   lastPushAt: 表示中の配信のテールが onChanged で最後に届いた時刻(0 = まだ届いていない)
 *   panelRefreshDue: パネルの数字の自己修復読みが必要(true なら省かない)
 * @returns {boolean} true = 今回は storage を読まなくてよい
 */
export function shouldSkipVenueSpeechPollRead(s) {
  if (!s || s.panelRefreshDue === true) return false;
  const now = Number(s.nowMs);
  const at = Number(s.lastPushAt);
  if (!Number.isFinite(now) || !Number.isFinite(at) || !(at > 0)) return false;
  const age = now - at;
  // 時計が戻った(age<0)ときは省かない=読む側に倒す
  return age >= 0 && age < VENUE_SPEECH_PUSH_FRESH_MS;
}
