// channelSwitchDiagKey.js
// 配信切替(SPA遷移でパネルを作り直さず in-place 切替する経路)の「切替回数/初描画ms」観測値を
//   content-entry.js(送信側)と popup-entry.js(受信側)の双方が書き、status が読む storage キー。
//   instantPushDiagKey.js と同じ方式(純観測値を書く→状態速報が行に再表示)。

/** 配信切替診断の storage キー(local only・観測値=件数/msだけで PII を含めない)。 */
export const KEY_CHANNEL_SWITCH_DIAG = 'nls_channel_switch_diag_v1';
