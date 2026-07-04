// milestoneEffectDiagKey.js
// コメント数マイルストーンの「検知→演出→効果音」が揃っているかの観測値を popup-entry.js が
//   書き、status が読む storage キー。giftEffectDiagKey.js と同じ方式
//   (純観測値を書く→健全度パネル/状態速報が色セルや行に再表示)。
// 目的(2026-07-04): コメント数マイルストーン(100/200/500/1000/2000/3000/5000/10000件)が
//   発火したか外部から確認する手段がゼロだった穴を埋める(giftEffectDiag.jsと同型)。

/** コメント数マイルストーン効果診断の storage キー(local only・観測値=件数だけでPIIを含めない)。 */
export const KEY_MILESTONE_EFFECT_DIAG = 'nls_milestone_effect_diag_v1';
