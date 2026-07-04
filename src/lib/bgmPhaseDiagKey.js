// bgmPhaseDiagKey.js
// BGMディレクター(bgmDirector.js)+フェーズディレクター(phaseDirector.js・Phase C)の
//   in/out回数・現在フェーズ・R値・B値を venueBar.js / popup-entry.js が書き、status が読む
//   storage キー。voiceEffectDiagKey.js / customSoundDiag.js と同じ方式
//   (純観測値を書く→状態速報が行に再表示。切り分けは状態速報のコピペで行う)。
// 目的(council/pachinko-ultimate-SYNTHESIS.md §6 Phase C 検証): 「実配信でリーチイン/アウトの
//   フェードを状態速報 extras の bgm 計器(in/out回数・現在状態・R値・B値・フェーズ)で確認する」。

/** BGM/フェーズ診断の storage キー(local only・観測値=件数/数値だけでPIIを含めない)。 */
export const KEY_BGM_PHASE_DIAG = 'nls_bgm_phase_diag_v1';
