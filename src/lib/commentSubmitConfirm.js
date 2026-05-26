/**
 * 拡張から watch のコメント欄へ送信したあと、入力欄の変化で成功を推定するためのポーリング。
 * React 等でクリアが遅い場合に備え、プローブ間隔を延長できる。
 */

/**
 * 累積ミリ秒（送信直後からの経過）。
 * 旧: 280,700,1400 → 2500,4000 を追加。
 * v0.1.396: 「送信中…」の体感短縮のため、早期チェック点 70/150ms を**前に足す**。
 *   ニコ生の入力欄は送信後 ~50-150ms で空になることが多く、最初のチェックが 280ms だと
 *   その分まるごと待っていた。早い点を足すだけ＝確認の確実性（後段 280..4000ms）は不変で、
 *   速くクリアした時だけ早く成功扱いになる（誤検知リスクなし＝欄が実際に変化したかで判定）。
 */
export const COMMENT_SUBMIT_CONFIRM_PROBE_MS = Object.freeze([
  70, 150, 280, 700, 1400, 2500, 4000
]);

/**
 * 送信が UI に反映されたとみなせるか（欄が空、または送った文と異なる内容になった）
 * @param {string} expectedNormalized normalizeCommentText 済みの送信文
 * @param {string} currentNormalized 現在の欄の正規化テキスト
 */
export function isEditorReflectingSubmit(expectedNormalized, currentNormalized) {
  const exp = String(expectedNormalized || '').trim();
  const cur = String(currentNormalized || '').trim();
  if (!exp) return false;
  if (!cur || cur !== exp) return true;
  return false;
}

/**
 * @param {{
 *   expectedNormalized: string,
 *   readNormalized: () => string,
 *   probeEndpointsMs?: readonly number[],
 *   sleep?: (ms: number) => Promise<void>
 * }} opts
 * @returns {Promise<boolean>} いずれかのプローブで反映されたら true
 */
export async function waitUntilEditorReflectsSubmit(opts) {
  const {
    expectedNormalized,
    readNormalized,
    probeEndpointsMs = COMMENT_SUBMIT_CONFIRM_PROBE_MS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  } = opts;

  const expected = String(expectedNormalized || '').trim();
  if (!expected) return false;

  // 送信直後に欄が既に空／別文なら待たずに成功扱い（体感遅延の削減）
  if (isEditorReflectingSubmit(expected, readNormalized())) return true;

  const endpoints = [...probeEndpointsMs].sort((a, b) => a - b);
  let waited = 0;
  for (const endpoint of endpoints) {
    const delta = Math.max(0, endpoint - waited);
    waited = endpoint;
    if (delta > 0) await sleep(delta);
    if (isEditorReflectingSubmit(expected, readNormalized())) return true;
  }
  return false;
}
