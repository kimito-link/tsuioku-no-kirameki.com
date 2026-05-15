/**
 * 北極星レーン左ガジェット「取得率」メーター用の純関数。
 * 0〜100 は UI の `--nl-acq-pct` にそのまま渡せる。
 * null は「数値パーセントは未定義（公式 DOM 未整備の待機）」— バーは装飾用の弱い点滅のみ。
 */

/**
 * @param {string} state `determineNorthStarLaneState` の戻り相当
 * @returns {number|null}
 */
export function acquisitionPctFromNorthStarLaneState(state) {
  const st = String(state || '').trim();
  if (st === 'ok' || st === 'no_event' || st === 'no_program_gift') return 100;
  if (st === 'not_yet' || st === 'iframe_unrendered') return null;
  if (st === 'fetch_error' || st === 'missing') return 0;
  return 0;
}

/**
 * @param {number|null} pct
 * @returns {'wait' | 'none' | 'low' | 'mid' | 'high' | 'full'}
 */
export function acquisitionTierFromPct(pct) {
  if (pct == null) return 'wait';
  if (!Number.isFinite(pct) || pct <= 0) return 'none';
  if (pct >= 100) return 'full';
  if (pct < 34) return 'low';
  if (pct < 67) return 'mid';
  return 'high';
}
