/**
 * HTML レポート向けコメンターフォロー分析ブロック。
 * マーケ分析と同じ純関数・UI を流用し、sec-* ID と card クラスでレポートに載せる。
 *
 * @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport
 */

import { escapeAttr } from './htmlEscape.js';
import { buildMarketingEmbedScriptInnerText } from './marketingReportEmbed.js';
import {
  buildCommenterFollowAnalyticsSectionHtml,
  buildCommenterFollowDirectorySectionHtml,
  commenterFollowSectionEmbeddedCss
} from './marketingChartsHtml.js';

/**
 * @param {{
 *   report: MarketingReport,
 *   identiconResolver?: (uid: string) => string,
 *   broadcasterUserId?: string,
 *   exportedAt?: string
 * }} input
 * @returns {{
 *   directoryHtml: string,
 *   analyticsHtml: string,
 *   embedScriptHtml: string,
 *   css: string,
 *   hasDirectory: boolean,
 *   hasAnalytics: boolean,
 *   hasAny: boolean
 * }}
 */
export function buildHtmlReportCommenterFollowBlock(input) {
  const report = input?.report;
  const identiconResolver = input?.identiconResolver;
  const broadcasterUserId = String(input?.broadcasterUserId || '').trim();
  const exportedAt = input?.exportedAt || new Date().toISOString();
  const baseOpts = {
    maskShare: false,
    identiconResolver,
    broadcasterUserId,
    extraSectionClass: 'card'
  };

  const directoryHtml = buildCommenterFollowDirectorySectionHtml(report, {
    ...baseOpts,
    sectionId: 'sec-commenter-follow'
  });
  const analyticsHtml = buildCommenterFollowAnalyticsSectionHtml(report, {
    ...baseOpts,
    sectionId: 'sec-commenter-follow-analytics',
    csvButtonId: 'html-commenter-follow-csv'
  });

  const hasDirectory = Boolean(directoryHtml);
  const hasAnalytics = Boolean(analyticsHtml);
  const embedScriptHtml =
    hasDirectory || hasAnalytics
      ? `<script type="application/json" id="nl-marketing-export-v1">${buildMarketingEmbedScriptInnerText(report, { exportedAt })}</script>`
      : '';

  return {
    directoryHtml: hasDirectory ? addSearchItemClass(directoryHtml) : '',
    analyticsHtml: hasAnalytics ? addSearchItemClass(analyticsHtml) : '',
    embedScriptHtml,
    css: hasDirectory || hasAnalytics ? commenterFollowSectionEmbeddedCss() : '',
    hasDirectory,
    hasAnalytics,
    hasAny: hasDirectory || hasAnalytics
  };
}

/**
 * 横断検索対象に載せる（セクション見出し・代表名など）。
 * @param {string} html
 * @returns {string}
 */
function addSearchItemClass(html) {
  return html.replace(
    'class="card mkt-section',
    `class="card mkt-section search-item" data-search="${escapeAttr('フォロー コメンター 散布図 セグメント')}"`
  );
}
