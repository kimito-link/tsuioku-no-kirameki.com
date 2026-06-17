/**
 * AI 共有「popup 固有診断」キャッシュの storage key を popup と status ページで共有。
 *
 * 背景(2026-06-18 ユーザー要望): popup の「AI診断コピー」には popup ランタイムにしか無い診断
 *   (watchSnapshotMeta / avatarLoadDiag / northStarRenderProbe / storageReadback)が含まれるが、
 *   status.html は content 由来の fastDiag(nls_ai_share_fast_diag_v1)しか読まないため、これらが
 *   届いていなかった。popup が AI診断バンドルを作るたびに popup.* ブロックをこのキーへ書き、
 *   status.html がそれを読んで「AI共有まとめ」に集約する。
 *
 * fastDiag(content が常時書く)とは【別キー】にする:
 *   - content は popup 固有値を持たない(popup を開いた時だけ取れる)ため、同じキーに混ぜると
 *     content の常時書き込みが popup 値を上書きしてしまう。別キーで分離して上書き合戦を防ぐ。
 *   - 値には persistedAt(最後に popup を開いて診断を作った時刻)を添え、古さを status 側で明示できる。
 */
export const KEY_AI_SHARE_POPUP_DIAG = 'nls_ai_share_popup_diag_v1';

/**
 * status.html へ集約する popup 固有診断レコードを組み立てる純関数。
 * popup の AI診断 payload(.popup を持つ)から、保存用の最小レコードを作る。
 * popup ブロックが無ければ null(=書き込み不要)。
 * @param {{ popup?: unknown, resolvedTabUrl?: unknown }} payload
 * @param {string} schemaVersion
 * @param {string} nowIso  呼び出し側で new Date().toISOString()(テスト容易化のため注入)
 * @returns {{ schemaVersion: string, persistedAt: string, resolvedTabUrl: string, popup: object } | null}
 */
export function buildAiSharePopupDiagRecord(payload, schemaVersion, nowIso) {
  const popup = payload && payload.popup;
  if (!popup || typeof popup !== 'object') return null;
  return {
    schemaVersion: String(schemaVersion || ''),
    persistedAt: String(nowIso || ''),
    resolvedTabUrl: String(payload.resolvedTabUrl || '').slice(0, 240),
    popup: /** @type {object} */ (popup)
  };
}
