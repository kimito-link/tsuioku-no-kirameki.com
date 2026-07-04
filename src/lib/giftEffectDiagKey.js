// giftEffectDiagKey.js
// ギフト/広告の「検知→演出(投擲)→効果音」が揃っているかの観測値を venueBar.js が書き、
//   status が読む storage キー。laneDiagKey.js / venueSeatsDiagKey.js と同じ方式
//   (純観測値を書く→健全度パネル/状態速報が色セルや行に再表示)。
// 目的(2026-07-04 ユーザー要望): 「ギフトがちゃんと飛ぶか・タイミングよく音が出るか」を
//   状態速報1枚で確認できるようにする(検知はしたのに演出/音が出ない取りこぼしの検知)。

/** ギフト効果診断の storage キー(local only・観測値=件数だけで PII を含めない)。 */
export const KEY_GIFT_EFFECT_DIAG = 'nls_gift_effect_diag_v1';
