/**
 * HTML レポートの「head 情報」テーブル行（link / meta / script / noopener）を
 * 純粋に組み立てる。
 *
 * 背景（C-7: buildHtmlReportDocument の分割・pure refactor）:
 *   popup-entry.js#buildHtmlReportDocument 内にインラインで定義されていた
 *   `linkRows` / `metaRows` / `scriptRows` / `noopenerRows` を、挙動を 1bit も
 *   変えずに純関数へ切り出したもの。snapshot の <head> から拾った links/metas/
 *   scripts/noopenerLinks をそれぞれ `<tr>` 文字列の配列にする。
 *
 *   いずれも module 状態・DOM・Date.now 等の非決定値に依存しない（入力配列だけで
 *   出力が決まる）。escape は既存 lib（htmlEscape）を用いるため循環 import なし。
 *   各行は検索用 `data-search` 属性（全フィールドを小文字連結＋escapeAttr）を持つ。
 *
 *   ⚠️ 元実装と完全一致させるための注意:
 *     - 値が空のセルは `'-'` を出す（scriptRows の type だけは既定 'text/javascript'）。
 *     - 文字列リテラル（改行・インデント）も元のまま保持する。
 */

import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * <link rel preload 等> の行。
 * @param {{ rel: string, href: string, as: string, type: string }[]} links
 * @returns {string[]}
 */
export function buildReportLinkRows(links) {
  return (Array.isArray(links) ? links : []).map((v) => {
    const search = escapeAttr(`${v.rel} ${v.href} ${v.as} ${v.type}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.rel)}</td>
          <td>${escapeHtml(v.href || '-')}</td>
          <td>${escapeHtml(v.as || '-')}</td>
          <td>${escapeHtml(v.type || '-')}</td>
        </tr>
      `;
  });
}

/**
 * <meta key/value> の行。
 * @param {{ key: string, value: string }[]} metas
 * @returns {string[]}
 */
export function buildReportMetaRows(metas) {
  return (Array.isArray(metas) ? metas : []).map((v) => {
    const search = escapeAttr(`${v.key} ${v.value}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.key)}</td>
          <td>${escapeHtml(v.value || '-')}</td>
        </tr>
      `;
  });
}

/**
 * <script src/type> の行（type 既定は 'text/javascript'）。
 * @param {{ src: string, type: string }[]} scripts
 * @returns {string[]}
 */
export function buildReportScriptRows(scripts) {
  return (Array.isArray(scripts) ? scripts : []).map((v) => {
    const search = escapeAttr(`${v.src} ${v.type}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.type || 'text/javascript')}</td>
          <td>${escapeHtml(v.src || '-')}</td>
        </tr>
      `;
  });
}

/**
 * target=_blank で rel=noopener が無い外部リンクの行。
 * @param {{ text: string, href: string }[]} links
 * @returns {string[]}
 */
export function buildReportNoopenerRows(links) {
  return (Array.isArray(links) ? links : []).map((v) => {
    const search = escapeAttr(`${v.text} ${v.href}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.text || '-')}</td>
          <td>${escapeHtml(v.href || '-')}</td>
        </tr>
      `;
  });
}
