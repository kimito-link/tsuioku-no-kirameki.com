// laneDiagKey.js
// 応援アイコン列(popup レーン)の「人数整合」観測値を popup が書き、status が読む storage キー。
//   voiceDiagKey.js / venueSeatsDiagKey.js と同じ方式(純観測値を書く→健全度パネルが色セルに再表示)。
//   目的(2026-06-22 ユーザー要望): 「素性が取れた人 N / レーンに出した人 M / 会場の席 K」が
//   合っているかを健全度パネルで一目で確認できるようにする(48 で黙って切る不整合の再発検知)。

/** 応援レーン診断の storage キー(local only・観測値=人数だけで PII を含めない)。 */
export const KEY_LANE_DIAG = 'nls_lane_diag_v1';
