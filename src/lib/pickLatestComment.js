/**
 * ストレージ上のコメント配列の並びは一定でないため、
 * コメント番号（10進数字列）があればそれを優先し、なければ capturedAt で最新を選ぶ。
 * @param {{ commentNo?: string, capturedAt?: number }[]} list
 * @returns {{ commentNo?: string, capturedAt?: number }|null}
 */
export function pickLatestCommentEntry(list) {
  if (!Array.isArray(list) || !list.length) return null;
  /** @param {{ commentNo?: string, capturedAt?: number }} e */
  const rank = (e) => {
    const noStr = String(e?.commentNo ?? '').trim();
    const noNum = /^\d+$/.test(noStr) ? Number(noStr) : NaN;
    const at = Number(e?.capturedAt || 0);
    return { noNum, at };
  };
  /** @param {{ commentNo?: string, capturedAt?: number }} a @param {{ commentNo?: string, capturedAt?: number }} b */
  const pickNewer = (a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    const aHas = Number.isFinite(ra.noNum);
    const bHas = Number.isFinite(rb.noNum);
    if (aHas && bHas && ra.noNum !== rb.noNum) {
      return ra.noNum > rb.noNum ? a : b;
    }
    if (aHas && !bHas) return a;
    if (!aHas && bHas) return b;
    return ra.at >= rb.at ? a : b;
  };
  let best = list[0];
  for (let i = 1; i < list.length; i += 1) {
    best = pickNewer(list[i], best);
  }
  return best;
}
