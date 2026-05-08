/**
 * `.nl-live-stat-value` 向け: 数字表示かプレースホルダー文言かを判定（0.1.68 以降の極太フォント切替と共通）。
 *
 * @param {unknown} text
 * @returns {boolean} true ならプレースホルダー（小さめスタイル）
 */
export function isStatValuePlaceholderText(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  return !/^~?[\d,，]+$/.test(t);
}
