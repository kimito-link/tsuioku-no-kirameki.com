/**
 * v0.1.634: HTML レポートの「自分のコメント抜粋」テーブル行ビルダ（純ロジック）。
 *
 * popup-entry.js#buildHtmlReportDocument のインライン `selfPostedRows`（v0.1.633 時点・
 * 16114-16125）を**挙動不変**で抽出した C-7 系 pure refactor。view-model（自コメ配列）→
 * `<tr>` HTML 文字列配列の純変換で、`chrome.*` を一切参照しない（Web版 app/app.js でも再利用可）。
 *
 * ⚠️ 厳密保全ポイント（会議室の地雷指摘）:
 *   - `data-search` は `` `${idx+1} ${text} ${commentNo||''}` `` の**スペース込みバイト列**を
 *     toLowerCase + escapeAttr したもの。commentNo 空なら末尾に空白が残る。検索 hit の挙動が
 *     ここに依存するため、整形でスペースを1つも変えてはならない（characterization でバイト固定）。
 *   - `text` は trim 済み。各セルは escapeHtml、search 属性のみ escapeAttr。
 *   - `formatDateTime` は注入（TZ/ロケール非決定を呼び出し側に固定し、lib をテスト可能に保つ）。
 *
 * @module reportSelfPostedRowsHtml
 */

import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * @typedef {object} SelfPostedComment
 * @property {string} [text] コメント本文（trim 前でよい・内部で trim する）。
 * @property {string|number} [commentNo] コメント番号。
 * @property {number} [capturedAt] 取得時刻（ms）。
 */

/**
 * 自コメ抜粋テーブルの `<tr>` HTML 文字列配列を組み立てる。
 *
 * @param {SelfPostedComment[]} selfPostedComments 自分のコメント配列（呼び出し側で
 *   `c.selfPosted` 済みのものを渡す。順序は呼び出し側の責務＝渡された順で 1 始まり採番）。
 * @param {object} deps
 * @param {(ms: number) => string} deps.formatDateTime 時刻整形関数（注入）。
 * @returns {string[]} 各自コメ 1 件 = 1 文字列（元実装の `.map` と同じ要素・同じ順序）。
 */
export function buildReportSelfPostedRows(selfPostedComments, { formatDateTime }) {
  const list = Array.isArray(selfPostedComments) ? selfPostedComments : [];
  return list.map((c, idx) => {
    const text = String(c?.text || '').trim();
    const search = escapeAttr(`${idx + 1} ${text} ${c?.commentNo || ''}`.toLowerCase());
    return `
      <tr class="search-item" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(String(c?.commentNo || '-'))}</td>
        <td>${escapeHtml(text || '-')}</td>
        <td>${escapeHtml(formatDateTime(c?.capturedAt || 0))}</td>
      </tr>
    `;
  });
}
