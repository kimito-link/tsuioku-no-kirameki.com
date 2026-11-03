/**
 * v0.1.1854: 旧「HTMLレポート」(コメント全文・検索・CSV・ユーザー別・自分のコメント等)を、
 *   マーケ分析レポートの1章として同じ HTML に入れる(ボタンをマーケ1つにまとめるため)。
 *   メディアキットの埋め込み(mediaKitEmbed.js)と同じやり方: CSS は章の囲い(id)の中だけに効かせる。
 *   検索・CSV の script は章の中にそのまま置く(id は旧レポート固有の q / nlReportCsv* でマーケ側と被らない)。
 */

import { escapeHtml } from '../shared/html/escape.js';
import { scopeCss } from './mediaKitEmbed.js';

export const HTML_REPORT_EMBED_SCOPE = '#mkt-html-report';

/** @param {string} css */
function stripCssComments(css) {
  return String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * buildHtmlReportDocument が作った単体 HTML から、head の CSS と body の中身を取り出す。
 * @param {string} reportHtml
 * @returns {{ css: string, bodyHtml: string } | null}
 */
export function extractHtmlReportParts(reportHtml) {
  const html = String(reportHtml || '');
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/);
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
  if (!headMatch || !bodyMatch) return null;
  const css = [...headMatch[1].matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  return { css, bodyHtml: bodyMatch[1] };
}

/**
 * マーケ分析レポートの1章(#mkt-html-report)として旧 HTML レポートを出す。取り出せなければ空文字(章ごと出さない)。
 * @param {string} reportHtml
 * @returns {string}
 */
export function sectionHtmlReportChapter(reportHtml) {
  const parts = extractHtmlReportParts(reportHtml);
  if (!parts) return '';
  const css = scopeCss(stripCssComments(parts.css), HTML_REPORT_EMBED_SCOPE);
  return `<section class="mkt-section" id="mkt-html-report-section">
<h2>${escapeHtml('コメント記録（全文検索・CSV・ユーザー別）')}</h2>
<p class="mkt-note">以前の「HTML」ボタンで保存していた内容です。記録したコメントの全文を検索でき、CSV でも取り出せます。</p>
<div id="mkt-html-report"><style>${css}</style>${parts.bodyHtml}</div>
</section>`;
}
