// venueSeatsDiagKey.js
// 会場モードの「座席健全度」観測値を会場(venueBar.js)が書き、status が読む storage キー。
//   voiceDiagKey.js と同じ方式(会場が純観測値を書く→健全度パネルが色セルに再表示)。
//   目的(2026-06-22 ユーザー要望): 会場座席情報を健全度パネルに載せ、AI も人間も
//   ミス(配信者本人の混入・顔ぶれずれ・会場の固着)を一目で発見できるようにする。

/** 会場座席診断の storage キー(local only・観測値のみで PII を含めない)。 */
export const KEY_VENUE_SEATS_DIAG = 'nls_venue_seats_diag_v1';
