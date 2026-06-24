/**
 * レポートプレビューの信頼度注釈に渡す「文脈」を fastDiag から組み立てる純関数。
 *
 * status-entry.js に直書きだった reportPreviewCtxFromFastDiag を、テスト可能な純関数として
 * 切り出したもの。chrome / DOM / 可変グローバルに依存しない。
 *
 * この ctx を buildReportPreviewLines に渡すと、metricConfidence が「コメントした人」等に
 * 確定値/推定の注釈を付け、見る人が取り違えないようにする。文脈不明(fastDiag 無し)は
 * 注釈なしに倒れる(煽らない・星野メソッド)。
 *
 * @module reportPreviewCtx
 */

/**
 * @typedef {{
 *   ndgrConnected: (boolean|undefined),
 *   withUidPercent: (number|null),
 *   backfillRunning: boolean
 * }} ReportPreviewCtx
 */

/**
 * fastDiag(+ backfill 進行)から信頼度注釈用の文脈を作る。
 *
 * 元の status-entry.js#reportPreviewCtxFromFastDiag と完全同一の判定:
 *   - ndgrConnected: 'connected'→true / 'disconnected'→false / それ以外('unknown'等)→undefined
 *     (不明は煽らないため真偽を断定しない)
 *   - withUidPercent: number ならそのまま / それ以外は null
 *   - backfillRunning: backfillProgress.done===0 かつ stopReason==='' のときだけ true
 *
 * @param {any} fastDiag content 側の診断ダイジェスト(無くても安全に倒れる)
 * @param {any} [backfillProgress] 過去ログ取得の進行(省略可)
 * @returns {ReportPreviewCtx}
 */
export function reportPreviewCtxFromFastDiag(fastDiag, backfillProgress) {
  const c = fastDiag?.content;
  const obs = c?.giftDiagnostics?.commentObservability;
  const uidPct = obs?.savedCommentsUidStats?.withUidPercent;
  const ndgr = String(c?.networkErrorProbe?.ndgrConnectStatus || '');
  return {
    // 'connected'=true / 'disconnected'=false / 'unknown'等=undefined(不明は煽らない)
    ndgrConnected: ndgr === 'connected' ? true : ndgr === 'disconnected' ? false : undefined,
    withUidPercent: typeof uidPct === 'number' ? uidPct : null,
    backfillRunning: !!(backfillProgress && backfillProgress.done === 0 && backfillProgress.stopReason === '')
  };
}
