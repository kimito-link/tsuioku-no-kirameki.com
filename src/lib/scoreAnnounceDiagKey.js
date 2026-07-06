// scoreAnnounceDiagKey.js
// 結果発表シーケンス(scoreAnnounce.js・SC3・council/broadcast-scoring-SYNTHESIS.md §2.1)の
//   実行回数/完走/中断観測値を popup-entry.js が書き、status が読む storage キー。
//   opSoundEffectDiagKey.js / bgmPhaseDiagKey.js と同じ方式
//   (純観測値を書く→状態速報が行に再表示。切り分けは状態速報のコピペで行う)。

/** 結果発表シーケンス診断の storage キー(local only・観測値=件数だけで PII を含めない)。 */
export const KEY_SCORE_ANNOUNCE_DIAG = 'nls_score_announce_diag_v1';
