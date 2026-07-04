// voiceEffectDiagKey.js
// パチンコボイス演出(voiceDirector.js・Phase B)の「発火/スキップ内訳」観測値を
//   venueBar.js / popup-entry.js が書き、status が読む storage キー。
//   giftEffectDiagKey.js / milestoneEffectDiagKey.js と同じ方式
//   (純観測値を書く→状態速報が行に再表示。切り分けは状態速報のコピペで行う)。
// 目的(council/pachinko-ultimate-SYNTHESIS.md §6 Phase B 検証): 「ギフト連打時に
//   ボイスが45秒CDで1回だけ鳴ること」等を実機目視せず状態速報1枚で確認できるようにする。

/** ボイス演出診断の storage キー(local only・観測値=件数だけで PII を含めない)。 */
export const KEY_VOICE_EFFECT_DIAG = 'nls_voice_effect_diag_v1';
