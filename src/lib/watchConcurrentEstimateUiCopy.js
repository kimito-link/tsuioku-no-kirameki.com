/** 同接ツールチップ先頭に載せる、推定方式の短い説明（`renderWatchMetaCard` と一致させる）。 */
export const SPARSE_CONCURRENT_ESTIMATE_NOTE = '来場者・統計が未取得のため推定は参考値';

/**
 * @param {'official'|'nowcast'|'fallback'} method
 * @returns {string}
 */
export function concurrentResolutionMethodTitlePart(method) {
  if (method === 'official') return 'watch WebSocket 由来の直接値';
  if (method === 'nowcast') return 'watch WebSocket の最終値から短期補間';
  return 'コメント/来場者ベースの推定';
}
