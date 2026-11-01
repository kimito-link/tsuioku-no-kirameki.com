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
// GPU の一言(2026-10-28・りんくのPCでエンジンが CPU で動いていて遅かった実例):
//   エンジンが GPU を使える(/supported_devices)のに、声づくりが遅い(isWeakVoicePc=P1 計器)ときだけ添える。
//   「今 CPU で動いている」とは断定しない(それを返す API が無い)ので「〜ことがあります」と案内に留める。
//
// 方針: 4秒以上で出し、2.5秒未満に戻るか読み上げ待ちが空になったら消す(出たり消えたりを繰り返さない)。

import { VOICE_STALE_MS_NORMAL } from './voiceAgeGate.js';
import { isWeakVoicePc, VOICE_WEAK_PC_MIN_WARM_SAMPLES } from './voiceNarrowing.js';

/** これ以上遅れたら一言を出す(ms)。 */
export const VOICE_LAG_NOTICE_SHOW_MS = 4000;

/** 出したあと、これ未満に戻ったら消す(ms)。 */
export const VOICE_LAG_NOTICE_HIDE_MS = 2500;

/** 遅れの一言に添える GPU の案内(準備中を過ぎても遅いときだけ)。 */
export const VOICE_GPU_HINT_TEXT = 'ずっと遅いときは、VOICEVOX の「設定」→「オプション」→「エンジンモード」を GPU にすると速くなることがあります';

/**
 * GPU の案内(遅れの一言とは別に、遅いと分かっている間ずっと出す)。2026-11-01 りんく「UIUX に入れておいてほしい」:
 *   以前は遅れの一言(4秒以上遅れたときだけ)の末尾に付けていたので、長い一文に埋もれて見落とされた。
 *   場所は VOICEVOX 0.26 の画面で確認(メニュー「設定」→「オプション」→ 項目「エンジンモード」で CPU/GPU を選ぶ)。
 *   切り替えると VOICEVOX のエンジンが再起動する(その間は読み上げが止まる)ので、それも書く。
 */
export const VOICE_GPU_TIP_TEXT = '⚡ 読み上げを速くするには: VOICEVOX の「設定」→「オプション」→「エンジンモード」を「GPU」に(切り替えると VOICEVOX が再起動します)';

/**
 * 起動直後(声の準備中)の一言。2026-10-31 りんく「ユーザーが理解できるようにするべき」:
 *   VOICEVOX を起動した直後に「約4秒遅れています」とだけ出ても、壊れたのか一時的なのか分からない。
 *   裏取り: 初めて使う声は 1 回目の合成が遅い(レッツノート実測 初回7.7秒→2回目以降0.7秒・coldSynthMaxMs の計器)。
 *   2回目以降の合成(warmSynthSamples)が VOICE_WEAK_PC_MIN_WARM_SAMPLES 件そろうまでを「準備中」とみなす。
 *   何分で終わるかは声の数と PC で変わるので、時間は書かない。
 */
export const VOICE_WARMING_TEXT = 'VOICEVOX を起動した直後は、初めて使う声の準備で遅れます。続けて読むうちに速くなります';

/**
 * まだ声の準備中か(2回目以降の合成が十分に測れていない)。
 * @param {{ warmSynthSamples?: number, warmRtfSamples?: number }} diag
 */
export function isVoiceWarmingUp(diag) {
  const samples = Math.max(Number(diag?.warmSynthSamples) || 0, Number(diag?.warmRtfSamples) || 0);
  return samples < VOICE_WEAK_PC_MIN_WARM_SAMPLES;
}

/**
 * GPU の案内を添えるか。エンジンが GPU を使えると分かっていて、声づくりが遅いと測れたときだけ。
 * @param {Parameters<typeof isWeakVoicePc>[0] & { voiceOverloaded?: boolean }} diag
 * @param {boolean|null|undefined} gpuCapable probeVoicevoxGpuCapable の結果
 * @returns {boolean}
 */
export function shouldHintVoiceGpu(diag, gpuCapable) {
  // 2026-10-31: 時間切れが続いた「混雑中」(voiceEngineOverload.js)も遅い証拠。成功した合成が無いと
  //   isWeakVoicePc は測れないため、ここを見ないと一番遅いときに案内が出なかった。
  return gpuCapable === true && (isWeakVoicePc(diag) || diag?.voiceOverloaded === true);
}

/**
 * GPU の案内を出すか(出すなら文言・出さないなら空文字)。遅れの大きさには関係なく、遅いと測れている間ずっと出す。
 * @param {Parameters<typeof shouldHintVoiceGpu>[0]} diag
 * @param {boolean|null|undefined} gpuCapable
 * @returns {string}
 */
export function decideVoiceGpuTip(diag, gpuCapable) {
  // 起動直後(初めての声の準備)はどの PC でも遅いので出さない。ただし時間切れが続く混雑中は準備中でも出す。
  if (isVoiceWarmingUp(diag) && diag?.voiceOverloaded !== true) return '';
  return shouldHintVoiceGpu(diag, gpuCapable) ? VOICE_GPU_TIP_TEXT : '';
}

/**
 * @param {boolean} prevShown 直前に出していたか
 * @param {{ e2eAvgMs?: number, upstreamEmaMs?: number, queueNow?: number, warmSynthEmaMs?: number, warmSynthSamples?: number, coldSynthMaxMs?: number, voiceOverloaded?: boolean }} diag
 * @param {{ gpuCapable?: boolean|null }} [_opts] 2026-11-01 から GPU の案内は decideVoiceGpuTip へ移した(呼び出し側の互換のため受け取るだけ)
 * @returns {{ shown: boolean, lagMs: number, text: string }}
 */
export function decideVoiceLagNotice(prevShown, diag, _opts = {}) {
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
    text: `読み上げが約${sec}秒遅れています。追いつくまで、${staleSec}秒より前のコメントは読まずに飛ばします`
      // GPU の案内は decideVoiceGpuTip で別の行に出す(2026-11-01)。ここに足すと二重になる。
      + (isVoiceWarmingUp(diag) && diag?.voiceOverloaded !== true
        ? `。${VOICE_WARMING_TEXT}`
        : '')
  };
}
