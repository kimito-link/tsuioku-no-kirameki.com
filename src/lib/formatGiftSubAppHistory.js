/**
 * v0.1.198: gift sub-app DOM 由来の history / totalCounts を popup 表示用に
 * フォーマットする純関数群。
 *
 * 入力は `nls_gift_subapp_history_<liveId>` payload を想定：
 *   {
 *     liveId, capturedAt,
 *     history: GiftHistoryItem[],
 *     totalCounts: TotalGiftCountItem[]
 *   }
 *
 * 副作用なし。HTML 生成は popup-entry.js 側で行う（escapeHtml が必要なため）。
 */

/**
 * @typedef {{
 *   historyCount: number,
 *   uniqueItemCount: number,
 *   uniqueSenderCount: number,
 *   totalPoints: number,
 *   hasData: boolean
 * }} GiftSubAppHistorySummary
 */

/**
 * payload から「履歴件数 / 種類数 / 送り主数 / 合計 pt」のサマリを生成する。
 * 壊れたフィールドがあっても落ちない（個別 item は数えるだけで集計から除外）。
 *
 * @param {{ history?: any, totalCounts?: any } | null | undefined} payload
 * @returns {GiftSubAppHistorySummary}
 */
export function summarizeGiftSubAppHistory(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      historyCount: 0,
      uniqueItemCount: 0,
      uniqueSenderCount: 0,
      totalPoints: 0,
      hasData: false
    };
  }
  const history = Array.isArray(payload.history) ? payload.history : [];
  const totalCounts = Array.isArray(payload.totalCounts) ? payload.totalCounts : [];

  const senderSet = new Set();
  let totalPoints = 0;
  for (const it of history) {
    if (!it || typeof it !== 'object') continue;
    const sender = String(/** @type {any} */ (it).senderName || '').trim();
    if (sender) senderSet.add(sender);
    const pts = Number(/** @type {any} */ (it).points);
    if (Number.isFinite(pts) && pts > 0) totalPoints += pts;
  }

  const itemSet = new Set();
  for (const it of totalCounts) {
    if (!it || typeof it !== 'object') continue;
    const name = String(/** @type {any} */ (it).itemName || '').trim();
    if (name) itemSet.add(name);
  }

  return {
    historyCount: history.length,
    uniqueItemCount: itemSet.size,
    uniqueSenderCount: senderSet.size,
    totalPoints,
    hasData: history.length > 0 || totalCounts.length > 0
  };
}

/**
 * popup の `<summary>` 行に出すラベル文字列を作る。
 *
 *   「履歴 60 件・33 種類・12 名」
 *   「未取得（ギフトサイドバーを開くと取得します）」
 *
 * @param {GiftSubAppHistorySummary} summary
 * @returns {string}
 */
export function formatGiftSubAppHistorySummaryLabel(summary) {
  if (!summary || !summary.hasData) {
    return '未取得（ギフトサイドバーを開くと取得します）';
  }
  /** @type {string[]} */
  const parts = [];
  if (summary.historyCount > 0) parts.push(`履歴 ${summary.historyCount} 件`);
  if (summary.uniqueItemCount > 0) parts.push(`${summary.uniqueItemCount} 種類`);
  if (summary.uniqueSenderCount > 0) parts.push(`${summary.uniqueSenderCount} 名`);
  if (parts.length === 0) return '未取得（ギフトサイドバーを開くと取得します）';
  return parts.join('・');
}
