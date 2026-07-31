// avCueDiagKey.js
// AVCue(音+視覚の単一発火点・council/pachinko-av-max-SYNTHESIS.md V1)の観測値を
//   venueBar.js が書き、status が読む storage キー。giftEffectDiagKey.js / opSoundEffectDiagKey.js
//   と同じ方式(純観測値を書く→状態速報が行に再表示。切り分けは状態速報のコピペで行う)。
// 目的: 「鳴った瞬間に必ず光る」が実機で本当に成立しているか(visualFired/suppressedLevel)を
//   状態速報1枚で確認できるようにする。

/** AVCue診断の storage キー(local only・観測値=件数だけで PII を含めない)。 */
export const KEY_AV_CUE_DIAG = 'nls_av_cue_diag_v1';
