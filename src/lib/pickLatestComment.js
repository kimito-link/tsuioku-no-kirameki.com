/**
 * ストレージ上のコメント配列の並びは一定でないため、
 * コメント番号（10進数字列）があればそれを優先し、なければ capturedAt で最新を選ぶ。
 *
 * ★0.1.2128: 1件ごとに比べ直すたびに「番号・時刻の組」を作っていたのをやめ、1件につき1回だけ読む形に。
 *   8万件の記録でティッカーの選び直し1回が CPU 4倍遅くで 0.8秒かかっていた(放送後の記録は窓に候補が無く毎回ここへ来る)。
 *   選ばれる1件は従来と同じ(同点は後ろの行が勝つ・番号の無い行より番号のある行が勝つ)。
 * @param {{ commentNo?: string, capturedAt?: number }[]} list
 * @returns {{ commentNo?: string, capturedAt?: number }|null}
 */
export function pickLatestCommentEntry(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const DIGITS = /^\d+$/;
  /** @param {any} e */
  const noOf = (e) => {
    const raw = e?.commentNo;
    if (raw === undefined || raw === null || raw === '') return NaN;
    const noStr = String(raw).trim();
    return DIGITS.test(noStr) ? Number(noStr) : NaN;
  };
  /** @param {any} e */
  const atOf = (e) => Number(e?.capturedAt || 0);
  let best = list[0];
  let bestNo = noOf(best);
  let bestAt = atOf(best);
  for (let i = 1; i < list.length; i += 1) {
    const e = list[i];
    const no = noOf(e);
    const eHas = Number.isFinite(no);
    const bHas = Number.isFinite(bestNo);
    let takeE;
    if (eHas && bHas && no !== bestNo) takeE = no > bestNo;
    else if (eHas && !bHas) takeE = true;
    else if (!eHas && bHas) takeE = false;
    else {
      const at = atOf(e);
      takeE = at >= bestAt;
      if (takeE) { best = e; bestNo = no; bestAt = at; }
      continue;
    }
    if (takeE) { best = e; bestNo = no; bestAt = atOf(e); }
  }
  return best;
}
