/**
 * v0.1.1010: 状態速報(status.html)の自動更新を「直近 refresh の所要に比例して間引く」純関数。
 *
 * 背景: 過去ログ取り込み中(backfill)＋複数配信記録中は、単一 LevelDB への大きな書込が連続し、
 *   status の小さな read すら競合で待たされて 1 refresh が 7秒近くまで膨れる(実機 7071ms)。
 *   固定 tick の間引き(v0.1.1009)では足りないので、重いほど大きく間引いて書込が drain する余地を
 *   作る。通常時(軽い)は 0=2秒のまま=コア表示の鮮度は不変。記録/取り込みには一切触らない。
 *
 * @module statusRefreshBackoff
 */

/** 自動更新の基準間隔(ms)。status-entry の REFRESH_INTERVAL_MS と一致させる。 */
export const REFRESH_INTERVAL_MS = 2000;
/** この所要(ms)以下なら通常時とみなし間引かない(0 tick)。 */
export const REFRESH_SLOW_MS = 500;
/** backoff tick の上限。激重時の天井。
 *  v0.1.1062: 15(30秒)→60(120秒)へ。実機で1回の更新が62秒かかる大配信のとき、天井30秒では
 *  「62秒読む→30秒休む」=読みっぱなしに近い占有率(67%)になり、storage輻輳でChrome全体が固まる
 *  一因だった(2026-07-04実機・9,400コメント配信)。天井120秒なら62秒読→62秒休=占有率50%以下。 */
export const REFRESH_BACKOFF_TICKS_MAX = 60;

/**
 * 直近 refresh の所要(ms)から「次に何 tick 間引くか」を決める。
 *   - 所要 <= REFRESH_SLOW_MS(または非数): 0(通常更新)。
 *   - それ以上: 所要 / 基準間隔 を切り上げた tick 数(2倍重ければ2tick…比例)。1〜上限でクランプ。
 * @param {number} lastMs 直近 refresh の totalMs
 * @param {{ intervalMs?: number, slowMs?: number, maxTicks?: number }} [opts] しきい値の上書き(テスト用)
 * @returns {number} スキップする tick 数(0〜maxTicks)
 */
export function computeRefreshBackoffTicks(lastMs, opts = {}) {
  const intervalMs =
    Number.isFinite(Number(opts.intervalMs)) && Number(opts.intervalMs) > 0
      ? Number(opts.intervalMs)
      : REFRESH_INTERVAL_MS;
  const slowMs =
    Number.isFinite(Number(opts.slowMs)) && Number(opts.slowMs) >= 0 ? Number(opts.slowMs) : REFRESH_SLOW_MS;
  const maxTicks =
    Number.isFinite(Number(opts.maxTicks)) && Number(opts.maxTicks) > 0
      ? Math.floor(Number(opts.maxTicks))
      : REFRESH_BACKOFF_TICKS_MAX;
  const ms = Number(lastMs);
  if (!Number.isFinite(ms) || ms <= slowMs) return 0;
  const ticks = Math.ceil(ms / intervalMs);
  return Math.max(1, Math.min(maxTicks, ticks));
}
