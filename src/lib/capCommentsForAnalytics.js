/** マーケ分析・タイムライン用のコメント上限（heavy 時の全件再走査を防ぐ） */
export const COMMENT_ANALYTICS_CAP = 2500;

/**
 * 件数が多い配信では均等サンプルで分析入力を cap する。
 * @template T
 * @param {readonly T[]} comments
 * @param {number} [max]
 * @returns {T[]}
 */
export function capCommentsForAnalytics(comments, max = COMMENT_ANALYTICS_CAP) {
  const list = Array.isArray(comments) ? comments : [];
  const cap = Math.max(1, Math.floor(Number(max) || COMMENT_ANALYTICS_CAP));
  if (list.length <= cap) return [...list];
  const out = [];
  const step = list.length / cap;
  for (let i = 0; i < cap; i++) {
    out.push(list[Math.floor(i * step)]);
  }
  return out;
}
