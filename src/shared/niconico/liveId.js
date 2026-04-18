/**
 * ニコ生 放送 ID (lv…) の正規化ユーティリティ。
 *
 * レイヤ: shared/ (ドメイン非依存 / 最下層)
 *
 * ユースケース:
 *   ・URL から抽出した `lv1234` と、保存行に入っている `1234` や `LV1234` を
 *     同じキーで比較できるようにする
 *   ・表記ゆれ（大文字小文字 / `lv` 接頭辞の有無）をここで吸収し、上位層では
 *     常に正規化済みの文字列で扱う
 *
 * NOTE: 旧正本は `src/lib/userLaneCandidatesFromStorage.js`。Phase 2 でここに
 *       canonical を移し、向こうは re-export shim に落とす（Parallel Change）。
 */

/**
 * lvId の表記ゆれ（lv 接頭辞・大文字小文字）を揃える。
 *
 * 空 / 空白 / null / undefined は空文字にする（呼び出し側で「未指定」と判断できる）。
 *
 * @param {unknown} v
 * @returns {string}
 */
export function normalizeLv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  return s.startsWith('lv') ? s : `lv${s}`;
}
