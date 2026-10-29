/**
 * 横付き(beside)パネルが視聴行の中に入った結果、ページが横にはみ出したかを判定する純粋関数。
 *
 * 経緯（v0.1.1825）: 1252px 幅の実配信で、パネル(幅640)を動画列の直後に挟むと
 * 動画列は最小幅までしか縮まず、パネル右端 1336px・公式コメ列は 1721px まで押し出されて
 * 横スクロールが出ていた。挿入前の実ギャップ計測は「隣が自分(host)」になると常に失敗し、
 * フォールバックが「ページ右が空いているか」だけを見て幅を上限せずに残していた。
 * 事前の見積もりはニコ生の flex の縮み方に依存して当てにならないので、
 * **置いた後の実測**ではみ出し量を測り、縮めて収まるなら幅を上限、収まらなければ below へ落とす。
 */

/**
 * @param {{
 *   viewportWidth: number,
 *   hostRect: { right: number, width: number },
 *   trailingRights?: number[],
 *   scrollX?: number,
 *   safeRight?: number,
 *   minCapPx?: number
 * }} input
 * @returns {{ action: 'none' } | { action: 'cap', capPx: number } | { action: 'below' }}
 */
export function decideBesideOverflow(input) {
  const vw = Number(input?.viewportWidth) || 0;
  const hr = input?.hostRect;
  if (!(vw > 0) || !hr || !Number.isFinite(hr.right) || !(hr.width > 0)) {
    return { action: 'none' };
  }
  const sx = Number(input.scrollX) || 0;
  let maxRight = hr.right;
  for (const r of input.trailingRights || []) {
    if (Number.isFinite(r) && r > maxRight) maxRight = r;
  }
  const overflow = maxRight + sx - vw;
  if (overflow <= 1) return { action: 'none' };
  const safeRight = Number.isFinite(input.safeRight) ? Number(input.safeRight) : 12;
  const minCap = Number.isFinite(input.minCapPx) ? Number(input.minCapPx) : 320;
  const capPx = Math.floor(hr.width - overflow - safeRight);
  return capPx >= minCap ? { action: 'cap', capPx } : { action: 'below' };
}

/**
 * はみ出しの記憶。タブ幅が変わったら忘れる（広げれば横付きへ戻れる）。
 * 同じ幅の中では締める方向にだけ更新する（cap→より小さい cap→below）＝行ったり来たりしない。
 * @typedef {{ vw: number, capPx: number | null, below: boolean }} BesideOverflowMemory
 */

/** @returns {BesideOverflowMemory} */
export function createBesideOverflowMemory() {
  return { vw: 0, capPx: null, below: false };
}

/**
 * @param {BesideOverflowMemory} mem
 * @param {number} vw
 * @returns {{ capPx: number | null, below: boolean } | null}
 */
export function besideOverflowFor(mem, vw) {
  if (!mem || mem.vw !== Math.round(Number(vw) || 0)) return null;
  if (!mem.below && mem.capPx == null) return null;
  return { capPx: mem.capPx, below: mem.below };
}

/**
 * @param {BesideOverflowMemory} mem
 * @param {number} vw
 * @param {ReturnType<typeof decideBesideOverflow>} decision
 * @returns {boolean} 記憶が変わったか（呼出元はこのときだけ描き直す）
 */
export function rememberBesideOverflow(mem, vw, decision) {
  if (!mem || !decision || decision.action === 'none') return false;
  const w = Math.round(Number(vw) || 0);
  if (mem.vw !== w) {
    mem.vw = w;
    mem.capPx = null;
    mem.below = false;
  }
  if (mem.below) return false;
  if (decision.action === 'below') {
    mem.below = true;
    return true;
  }
  if (mem.capPx == null || decision.capPx < mem.capPx) {
    mem.capPx = decision.capPx;
    return true;
  }
  return false;
}
