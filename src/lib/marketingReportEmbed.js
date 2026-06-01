/**
 * マーケ分析 HTML に埋め込む JSON（表計算・ツール連携用）。
 * @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport
 */

import { maskLabelForShare } from './privacyDisplay.js';

/**
 * 埋め込み用にレポートをクローン（共有伏せ字時は topUsers をマスク）。
 * @param {MarketingReport} report
 * @param {boolean} maskShareLabels
 * @returns {MarketingReport}
 */
export function cloneReportForJsonEmbed(report, maskShareLabels) {
  const r = /** @type {MarketingReport} */ (JSON.parse(JSON.stringify(report)));
  if (!maskShareLabels) return r;
  /** @param {import('./marketingAggregate.js').UserCommentProfile} u */
  const maskUser = (u) => ({
    ...u,
    nickname: maskLabelForShare(String(u.nickname || '')),
    userId: maskLabelForShare(String(u.userId || '')),
    avatarUrl: ''
  });
  r.topUsers = r.topUsers.map(maskUser);
  if (Array.isArray(r.allNumericCommenters)) {
    r.allNumericCommenters = r.allNumericCommenters.map(maskUser);
  }
  if (r.commenterFollowDataset && Array.isArray(r.commenterFollowDataset.rows)) {
    r.commenterFollowDataset = {
      ...r.commenterFollowDataset,
      rows: r.commenterFollowDataset.rows.map((row) => ({
        ...row,
        userId: maskLabelForShare(String(row.userId || '')),
        nickname: maskLabelForShare(String(row.nickname || ''))
      }))
    };
  }
  return r;
}

/**
 * `<script type="application/json">` 内にそのまま置ける文字列（`</script>` 破壊を防ぐ）。
 * @param {MarketingReport} report
 * @param {{ maskShareLabels?: boolean, exportedAt?: string }} [opts]
 * @returns {string}
 */
export function buildMarketingEmbedScriptInnerText(report, opts = {}) {
  const maskShareLabels = opts.maskShareLabels === true;
  const exportedAt = opts.exportedAt || new Date().toISOString();
  const safeReport = cloneReportForJsonEmbed(report, maskShareLabels);
  const payload = {
    schemaVersion: 1,
    exportedAt,
    maskShareLabels,
    liveId: report.liveId,
    report: safeReport
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}
