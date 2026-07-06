// highlightLedgerKey.js
// 配信採点「発表演出」用のハイライト台帳(実際に画面に出た演出だけを記録する最小台帳)の
//   storage キー(local only)。giftEffectDiagKey.js / bgmPhaseDiagKey.js と同じ単一キー方式。
// council/broadcast-scoring-SYNTHESIS.md §2.2(SC2)。

/** ハイライト台帳の storage キー(単一キー・{liveId, rows[], capturedAt})。 */
export const KEY_HIGHLIGHT_LEDGER = 'nls_highlight_ledger_v1';
