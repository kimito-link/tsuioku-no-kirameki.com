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

/**
 * 北極星レーンの「%」に付ける説明(title)。0.1.2131 で popup-entry から外出し(文言は同じ)。
 * @param {string} laneId
 * @param {string} giftRankMetric 'throws' | 'points' | ''
 * @param {number|null} pct
 * @returns {string}
 */
export function acquisitionPctTitle(laneId, giftRankMetric, pct) {
  if (pct == null) return 'パーセントではありません。ニコ生側の一覧がDOMに出るまでの待機表示です。';
  if (pct < 100) return 'レーン単位の取得失敗・未取得を示します。ギフト履歴の「取り逃し率」ではありません。';
  if (laneId === 'giftHistory' && giftRankMetric === 'throws') {
    return '一覧の数字は「投げた回数」です（pt ではありません）。公式のギフト履歴合計ptや、レーン「番組累計ポイント」（ティッカーのギフトpt累計）とは別指標です。';
  }
  if (laneId === 'giftHistory' && giftRankMetric === 'points') {
    return '公式履歴タブ由来のユーザー別「履歴上の合計pt」です。レーン「番組累計ポイント」（番組全体のギフトpt累計）とは別物です。';
  }
  return 'この「%」はレーンの公式DOM鏡像の成立度（成立時は設計上ここが100%）です。番組累計ポイントの増え方やギフト履歴の行数とは別の指標です。';
}
