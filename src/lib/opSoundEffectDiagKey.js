// opSoundEffectDiagKey.js
// 操作音(opSoundDirector.js・Phase D1)の「押下/成功/発音」観測値を
//   popup-entry.js が書き、status が読む storage キー。
//   voiceEffectDiagKey.js / giftEffectDiagKey.js と同じ方式
//   (純観測値を書く→状態速報が行に再表示。切り分けは状態速報のコピペで行う)。
// 目的(council/operation-sound-SYNTHESIS.md Phase D1 検証): 「押下→成功→発音」の三段が
//   実際につながっているか(押下だけで成功が無い=送信失敗、成功しても発音が無い=未割当)を
//   状態速報1枚で確認できるようにする。

/** 操作音診断の storage キー(local only・観測値=件数だけで PII を含めない)。 */
export const KEY_OP_SOUND_EFFECT_DIAG = 'nls_op_sound_effect_diag_v1';
