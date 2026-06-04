/**
 * v0.1.635: HTML レポートの「やさしいメタ情報」テーブル行ビルダ + ラベル変換（純ロジック）。
 *
 * popup-entry.js#buildHtmlReportDocument のインライン `friendlyMetaRowsHtml`（16136-16144）と
 * popup ローカル helper `friendlyHtmlReportMetaLabel`（15185-15201）を**挙動不変**で抽出した
 * C-7 系 pure refactor。両者は 1 対 1 で密結合（ラベルは labels テーブルというデータ本体を持つ
 * 純関数）なので同居 export する（reportHeadInfoRowsHtml が 4 関数同居する前例どおり）。
 * `chrome.*` を一切参照しない（Web版 app/app.js でも再利用可）。
 *
 * ⚠️ 厳密保全ポイント（会議室の地雷指摘）:
 *   - `data-search` は `` `${v.key} ${v.value} ${label}` `` の**スペース込みバイト列**を
 *     toLowerCase + escapeAttr。連結順（key→value→label）を変えてはならない。
 *   - td は**2列**で `class="mono"` は**2列目（value）のみ**。`<tr>` 前インデントは 8 スペース。
 *   - label セルは fallback 無し（`escapeHtml(label)`）。value セルのみ `v.value || '-'`。
 *
 * @module reportFriendlyMetaRowsHtml
 */

import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * meta キーを利用者に分かりやすい日本語ラベルへ変換する（既知キーは固定表・未知は key 素通し）。
 * @param {string} key meta の name/property キー。
 * @returns {string} 表示ラベル（未知キーは元の key をそのまま返す）。
 */
export function friendlyHtmlReportMetaLabel(key) {
  const k = String(key || '').toLowerCase().trim();
  /** @type {Record<string, string>} */
  const labels = {
    description: 'ページ説明（meta）',
    keywords: 'キーワード（meta）',
    'og:title': 'シェア用タイトル（Open Graph）',
    'og:description': 'シェア用説明（Open Graph）',
    'og:image': 'シェア用画像URL（Open Graph）',
    'og:url': '正規URL（Open Graph）',
    'og:site_name': 'サイト名（Open Graph）',
    'og:type': '種類（Open Graph）',
    'twitter:title': 'シェア用タイトル（X）',
    'twitter:description': 'シェア用説明（X）'
  };
  if (k.startsWith('twitter:image')) return 'シェア用画像（X）';
  return labels[k] || key;
}

/**
 * @typedef {object} FriendlyMeta
 * @property {string} key meta キー。
 * @property {string} [value] meta の値。
 */

/**
 * やさしいメタ情報テーブルの `<tr>` HTML 文字列配列を組み立てる。
 *
 * @param {FriendlyMeta[]} friendlyMetas partitionMetasForHtmlReport の friendly 配列。
 * @returns {string[]} 各メタ 1 件 = 1 文字列（元実装の `.map` と同じ要素・同じ順序）。
 */
export function buildReportFriendlyMetaRows(friendlyMetas) {
  const list = Array.isArray(friendlyMetas) ? friendlyMetas : [];
  return list.map((v) => {
    const label = friendlyHtmlReportMetaLabel(v?.key);
    const search = escapeAttr(`${v?.key} ${v?.value} ${label}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(label)}</td>
          <td class="mono">${escapeHtml(v?.value || '-')}</td>
        </tr>`;
  });
}
