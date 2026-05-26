/**
 * `.nl-live-stat-value` 向け: 数字表示かプレースホルダー文言かを判定（0.1.68 の極太フォント切替と共通）。
 * 数字 (`'1,234'`) と「~」プレフィックス推定値 (`'~250'`) は数値扱い。
 * 「（取得不可）」「計測中…」「—」「-」などはフォールバック扱い（CSS で小サイズへ）。
 *
 * @param {unknown} text
 * @returns {boolean} true ならプレースホルダー（小さめスタイル）
 */
export function isStatValuePlaceholderText(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  return !/^~?[\d,，]+$/.test(t);
}
