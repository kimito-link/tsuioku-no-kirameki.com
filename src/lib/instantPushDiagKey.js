// instantPushDiagKey.js
// コメント即時プッシュレーン(storage迂回)の「送信N/受信N/表示遅延ms」観測値を
//   content-entry.js(送信側)と popup-entry.js(受信側)の双方が書き、status が読む storage キー。
//   commentPostDiagKey.js / voiceEffectDiagKey.js と同じ方式(純観測値を書く→状態速報が行に再表示)。
//   1キーを2プロセスが書く点は voiceEffectDiag と同型(giftEffectDiagKey.js 系の precedent)で、
//   診断専用(正確性が要求される記録/演出トリガではない)なので read-merge-write の競合は許容する。

/** 即時プッシュ診断の storage キー(local only・観測値=件数/msだけで PII を含めない)。 */
export const KEY_INSTANT_PUSH_DIAG = 'nls_instant_push_diag_v1';
