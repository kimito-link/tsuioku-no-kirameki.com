// externalLinksSectionHtml.js
// v0.1.812(星野ロミ式コンポーネント化・第5弾): buildHtmlReportDocument 内の
//   「支援物資・外部リンク」セクション(snapshot.noopenerLinks → チップ列)の純関数を抽出(挙動完全不変)。
//   正本=council/hoshinoromi-componentize-factor-SYNTHESIS.md。
//
// snapshot.noopenerLinks(配列)だけを入力に取る純関数。依存は isHttpOrHttpsUrl/escapeAttr/escapeHtml の
//   既存 lib のみ(URL/Set は組み込み)=罠ゼロ。

import { escapeHtml, escapeAttr } from './htmlEscape.js';
import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * 「支援物資・外部リンク」セクション HTML を組み立てる(純関数)。
 * http/https のみ・重複除去・最大20件・ラベルは60字で省略。リンクが無ければ空文字。
 * @param {Array<{ href?: unknown, text?: unknown }>|null|undefined} noopenerLinks snapshot.noopenerLinks
 * @returns {string}
 */
export function buildExternalLinksSectionHtml(noopenerLinks) {
  const links = Array.isArray(noopenerLinks) ? noopenerLinks : [];
  const seen = new Set();
  const chips = [];
  for (const l of links) {
    const href = String(l?.href || '').trim();
    if (!isHttpOrHttpsUrl(href) || seen.has(href)) continue;
    seen.add(href);
    let label = String(l?.text || '').replace(/\s+/g, ' ').trim();
    if (!label) {
      try {
        label = new URL(href).hostname.replace(/^www\./, '');
      } catch {
        label = href;
      }
    }
    if (label.length > 60) label = `${label.slice(0, 57)}…`;
    chips.push(
      `<a class="tag-chip nl-user-profile-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    );
    if (chips.length >= 20) break;
  }
  return chips.length
    ? `<h2 style="margin-top:12px;">支援物資・外部リンク</h2><div class="tag-list">${chips.join('')}</div>`
    : '';
}
