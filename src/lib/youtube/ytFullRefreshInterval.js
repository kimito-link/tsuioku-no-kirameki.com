/**
 * YouTube 系の横の欄・会場が「記録を全件読み直す」間隔(v0.1.1969)。
 *
 * ふだんは新しく記録された分だけを読み、全件は混ざった行の片付け(削除)や後から付いた顔(iconUrl)を拾うために
 * ときどき読み直す。旧版は行数に関係なく30秒ごとで、PC 実測(Kick・約5.5万行)では1回 約28MB の受け取りが
 * 30秒ごとに来ていた。行数に比例して間隔を延ばし、上限5分にする(5,000行までは従来どおり30秒)。
 */
export const YT_FULL_REFRESH_BASE_MS = 30_000;
export const YT_FULL_REFRESH_MAX_MS = 300_000;
export const YT_FULL_REFRESH_ROWS_PER_STEP = 5_000;

/**
 * @param {number} rows いま控えている行数
 * @returns {number} ms
 */
export function ytFullRefreshIntervalMs(rows) {
  const n = Number(rows);
  if (!Number.isFinite(n) || n <= YT_FULL_REFRESH_ROWS_PER_STEP) return YT_FULL_REFRESH_BASE_MS;
  return Math.min(YT_FULL_REFRESH_MAX_MS, Math.round((YT_FULL_REFRESH_BASE_MS * n) / YT_FULL_REFRESH_ROWS_PER_STEP));
}
