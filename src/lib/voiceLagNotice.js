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
// GPU への切り替え案内は出さない。CPU は低スペック向けの基準で、計算モードは利用者が選ぶ。

import { VOICE_STALE_MS_NORMAL } from './voiceAgeGate.js';
import { VOICE_WEAK_PC_MIN_WARM_SAMPLES } from './voiceNarrowing.js';

/** これ以上遅れたら一言を出す(ms)。 */
export const VOICE_LAG_NOTICE_SHOW_MS = 4000;

/** 出したあと、これ未満に戻ったら消す(ms)。 */
export const VOICE_LAG_NOTICE_HIDE_MS = 2500;

/**
 * 起動直後(声の準備中)の一言。2026-10-31 りんく「ユーザーが理解できるようにするべき」:
 *   VOICEVOX を起動した直後に「約4秒遅れています」とだけ出ても、壊れたのか一時的なのか分からない。
 *   裏取り: 初めて使う声は 1 回目の合成が遅い(レッツノート実測 初回7.7秒→2回目以降0.7秒・coldSynthMaxMs の計器)。
 *   2回目以降の合成(warmSynthSamples)が VOICE_WEAK_PC_MIN_WARM_SAMPLES 件そろうまでを「準備中」とみなす。
 *   何分で終わるかは声の数と PC で変わるので、時間は書かない。
 */
export const VOICE_WARMING_TEXT = 'VOICEVOX を起動した直後は、初めて使う声の準備で遅れます。続けて読むうちに速くなります';

/**
 * 2026-11-03: VOICEVOX が追いつかず、PC の声(Windows の声)で読んでいる間の一言(voiceLightFallback.js)。
 *   声が変わったのを「壊れた」と思わせないために、なぜ変わったか・いつ戻るかを書く。
 */
export const VOICE_LIGHT_ACTIVE_TEXT = 'VOICEVOX が追いつかないので、いまは PC の声で読んでいます。VOICEVOX が速くなったら自動で戻ります';

/**
 * 2026-11-09 りんく「この注意書きかいたほうがいい」: PC の声が Chrome に止められている間の一言。
 *   裏取り: speechSynthesis の失敗理由が 'not-allowed'(voiceLightSpeaker.lastError)のときだけ出す。
 *   Chrome は読み込み直したあと一度もクリックしていないページでは声を鳴らさない(自動再生の決まり)。
 *   りんくの PC で無音→配信ページを1回クリックで鳴り始めた(2026-11-09 16:5x JST)。
 */
export const VOICE_LIGHT_BLOCKED_TEXT = '🔈 PC の声で読み上げるには、この配信ページを1回クリックしてください(Chrome は読み込み直したあと、クリックするまで声を鳴らしません)';

/**
 * まだ声の準備中か(2回目以降の合成が十分に測れていない)。
 * @param {{ warmSynthSamples?: number, warmRtfSamples?: number }} diag
 */
export function isVoiceWarmingUp(diag) {
  const samples = Math.max(Number(diag?.warmSynthSamples) || 0, Number(diag?.warmRtfSamples) || 0);
  return samples < VOICE_WEAK_PC_MIN_WARM_SAMPLES;
}

/**
 * GPU への切り替え案内は出さない。以前の呼び出しが残っても空。
 * @returns {string}
 */
export function decideVoiceGpuTip() {
  return '';
}

/**
 * @param {boolean} prevShown 直前に出していたか
 * @param {{ e2eAvgMs?: number, upstreamEmaMs?: number, queueNow?: number, warmSynthEmaMs?: number, warmSynthSamples?: number, coldSynthMaxMs?: number, voiceOverloaded?: boolean, lightVoiceActive?: boolean, lightVoiceBlocked?: boolean }} diag
 * @param {{ gpuCapable?: boolean|null }} [_opts] 受け取るだけ。計算モードの案内には使わない
 * @returns {{ shown: boolean, lagMs: number, text: string }}
 */
export function decideVoiceLagNotice(prevShown, diag, _opts = {}) {
  // 2026-11-09: Chrome に止められて無音のときは、何をすれば鳴るかを最優先で出す(声の切り替えより先)。
  if (diag?.lightVoiceBlocked === true) return { shown: true, lagMs: -1, text: VOICE_LIGHT_BLOCKED_TEXT };
  // 2026-11-03: 軽い声で読んでいる間は、遅れではなく「声を切り替えた」ことを伝える(遅れの平均は VOICEVOX の頃の値)。
  if (diag?.lightVoiceActive === true) return { shown: true, lagMs: -1, text: VOICE_LIGHT_ACTIVE_TEXT };
  const e2e = Number(diag?.e2eAvgMs);
  const up = Number(diag?.upstreamEmaMs);
  const queueNow = Number(diag?.queueNow);
  if (!Number.isFinite(e2e) || e2e < 0) return { shown: false, lagMs: -1, text: '' };
  const lagMs = Math.round(e2e + (Number.isFinite(up) && up > 0 ? up : 0));
  // 待ちが空になった=もう追いついている。古い平均で出し続けない。
  // v0.1.1866: 前に出していなくても待ち0なら出さない(開き直した直後に古い平均だけで「約19秒遅れ」が出ていた・YouTube 版 0.1.102 で確認)。
  if (Number.isFinite(queueNow) && queueNow <= 0) return { shown: false, lagMs, text: '' };
  const shown = prevShown ? lagMs >= VOICE_LAG_NOTICE_HIDE_MS : lagMs >= VOICE_LAG_NOTICE_SHOW_MS;
  if (!shown) return { shown: false, lagMs, text: '' };
  const sec = Math.round(lagMs / 1000);
  const staleSec = Math.round(VOICE_STALE_MS_NORMAL / 1000);
  return {
    shown: true,
    lagMs,
    text: `読み上げが約${sec}秒遅れています。追いつくまで、${staleSec}秒より前のコメントは読まずに飛ばします`
      + (isVoiceWarmingUp(diag) && diag?.voiceOverloaded !== true
        ? `。${VOICE_WARMING_TEXT}`
        : '')
  };
}
