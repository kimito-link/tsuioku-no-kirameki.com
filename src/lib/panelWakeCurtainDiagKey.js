// panelWakeCurtainDiagKey.js
// 「幕(シェード)が全画面を覆った回数」の観測値を popup-entry.js が書き、status が読む storage キー。
//   instantPushDiagKey.js / voiceEffectDiagKey.js と同じ方式(純観測値を書く→状態速報が行に再表示)。
//
// ■ ★なぜこの計器が要るか(2026-08-19・ユーザー要望「幕自体を診断に出して隠れないようにする」)
//   幕は position:fixed / inset:0 / z-index:99999 で【画面全部を覆う】。
//   覆っている間はユーザーから見て「黒い(暗い)影」に見え、
//   実際に「引っ張る瞬間くろくなる」という報告になった(v0.1.1432 の resize 幕)。
//
//   ★このとき panelWakeCurtainDom.js は shownResize を数えていたのに、
//     getPanelWakeCurtainDiag() の【呼び手がリポ全体にゼロ】だった。
//     ＝幕が何回出ても、その数字はどこにも現れなかった。
//     [[unwired-judgement-is-systemic-2026-08-12]](判定はあるが配線されていない)の再発。
//
//   → 幕は「隠す」道具なので、出たこと自体が隠れると気づけない。
//     だから【出たら必ず数字に出す】。将来また誰かが幕を復活させても、
//     状態速報の shownResize が増えて即座に分かる。
//
// 観測値だけ(件数)で PII を含めない。

/** 幕の観測値の storage キー(local only)。 */
export const KEY_PANEL_WAKE_CURTAIN_DIAG = 'nls_panel_wake_curtain_diag_v1';
