// highlightLedgerKey.js
// 配信採点「発表演出」用のハイライト台帳(実際に画面に出た演出だけを記録する最小台帳)の
//   storage キー(local only)。giftEffectDiagKey.js と同じ単一キー方式。
// council/broadcast-scoring-SYNTHESIS.md §2.2(SC2)。

/** ハイライト台帳の storage キー(単一キー・{liveId, rows[], capturedAt})。 */
export const KEY_HIGHLIGHT_LEDGER = 'nls_highlight_ledger_v1';

/**
 * 配信ごとの台帳キー(2026-10-09)。
 *   単一キーだと、2配信を同時に記録している間、appendHighlight が「別の配信なら台帳を置換」するため
 *   配信Bのハイライトが配信Aの台帳を消していた(最終スコア・発表にハイライトが出ない=記録の消失)。
 *   命名は応援レーン鏡(laneMirrorKeyFor)と同じ `nls_<用途>_<lv>`。
 *   共通キー(KEY_HIGHLIGHT_LEDGER)は「最後に書いた台帳のコピー」として残す(状態速報の互換・移行読み取り)。
 * @param {unknown} liveId 例 'lv351133862'(大文字小文字は正規化)
 * @returns {string} 空/不正な liveId のときは空文字
 */
export function highlightLedgerKeyFor(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return '';
  return `${KEY_HIGHLIGHT_LEDGER}_${lid}`;
}
