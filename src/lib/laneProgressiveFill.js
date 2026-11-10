/**
 * 大きな段(応援マスが数百〜数千個)を、1回で全部作らずに数回に分けて足すための決まり(v0.1.2008)。
 *
 * 背景(PC 実測 2026-11-10・Kick 81,110行・りんく段 約2,000人・CPU 4倍遅く):
 *   マスを 2,000個まとめて作って並べる1回が、開いた直後(鏡からの先出し)で約5秒、全件の読み出しのあとで約8秒の
 *   固まりになっていた。1回に新しく作るマスの数を決めて、残りは次の仕事へ回す。
 *
 * 守ること:
 *   - 既に出ているマス(見た目が同じ人)は外さない・待たせない。待たせるのは「新しく作る」マスだけ。
 *   - 並びは最後まで足し終えたときに、1回で作ったときと同じになる。
 *   - 会場(席に包む描き方)と、ふつうの大きさの段は今までどおり1回で作る。
 */

/** この個数以上の段だけ分けて足す */
export const LANE_PROGRESSIVE_MIN_ITEMS = 600;
/** 1回に新しく作るマスの数 */
export const LANE_PROGRESSIVE_NEW_PER_PASS = 250;

/**
 * この段を分けて足すか。
 * @param {{ itemCount: number, hasWrap: boolean, canSchedule: boolean }} ctx
 * @returns {boolean}
 */
export function shouldFillLaneProgressively(ctx) {
  if (!ctx || typeof ctx !== 'object') return false;
  if (ctx.hasWrap === true) return false; // 会場は対象外
  if (ctx.canSchedule !== true) return false;
  const n = Number(ctx.itemCount);
  return Number.isFinite(n) && n >= LANE_PROGRESSIVE_MIN_ITEMS;
}

/**
 * 新しく作るマスを、今回の回で作ってよいか(false=次の回へ回す)。
 * @param {{ progressive: boolean, newBuiltSoFar: number }} ctx
 * @returns {boolean}
 */
export function mayBuildNewLaneTileNow(ctx) {
  if (!ctx || ctx.progressive !== true) return true;
  return (Number(ctx.newBuiltSoFar) || 0) < LANE_PROGRESSIVE_NEW_PER_PASS;
}
