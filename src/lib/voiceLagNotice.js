// voiceLagNotice.js — 読み上げが大きく遅れているときの一言(会場・コメビュ共通)。DOM も chrome API も触らない純関数。
//
// 背景(2026-10-22 りんく・計画書 P5「遅れの表示」):
//   ノートPCでは読み上げが数秒遅れても、画面には何も出ないので「壊れた」のか「遅れている」のか分からない。
//   遅れが大きいときだけ、何秒遅れているかと、どう追いつくかを一言出す。
//
// 文言の裏取り(AGENTS.md §12.7):
//   - 秒数 = P1 の計器そのもの(受信→キュー upstreamEmaMs + キュー→声が出る e2eAvgMs)。推定ではない。
//   - 「8秒以上待ったコメントは読まずに飛ばす」= voiceAgeGate.isVoiceItemStale の通常コメントの基準
//     (VOICE_STALE_MS_NORMAL・キュー投入から数える)。原因(PCが重い等)はここでは断定しない。
//
// 方針: 4秒以上で出し、2.5秒未満に戻るか読み上げ待ちが空になったら消す(出たり消えたりを繰り返さない)。

import { VOICE_STALE_MS_NORMAL } from './voiceAgeGate.js';

/** これ以上遅れたら一言を出す(ms)。 */
export const VOICE_LAG_NOTICE_SHOW_MS = 4000;

/** 出したあと、これ未満に戻ったら消す(ms)。 */
export const VOICE_LAG_NOTICE_HIDE_MS = 2500;

/**
 * @param {boolean} prevShown 直前に出していたか
 * @param {{ e2eAvgMs?: number, upstreamEmaMs?: number, queueNow?: number }} diag
 * @returns {{ shown: boolean, lagMs: number, text: string }}
 */
export function decideVoiceLagNotice(prevShown, diag) {
  const e2e = Number(diag?.e2eAvgMs);
  const up = Number(diag?.upstreamEmaMs);
  const queueNow = Number(diag?.queueNow);
  if (!Number.isFinite(e2e) || e2e < 0) return { shown: false, lagMs: -1, text: '' };
  const lagMs = Math.round(e2e + (Number.isFinite(up) && up > 0 ? up : 0));
  // 待ちが空になった=もう追いついている。古い平均で出し続けない。
  if (Number.isFinite(queueNow) && queueNow <= 0 && prevShown) return { shown: false, lagMs, text: '' };
  const shown = prevShown ? lagMs >= VOICE_LAG_NOTICE_HIDE_MS : lagMs >= VOICE_LAG_NOTICE_SHOW_MS;
  if (!shown) return { shown: false, lagMs, text: '' };
  const sec = Math.round(lagMs / 1000);
  const staleSec = Math.round(VOICE_STALE_MS_NORMAL / 1000);
  return {
    shown: true,
    lagMs,
    text: `読み上げが約${sec}秒遅れています(${staleSec}秒以上待ったコメントは読まずに飛ばして追いつきます)`
  };
}
