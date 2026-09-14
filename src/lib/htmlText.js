/**
 * htmlText.js — HTML に文字列を流し込むときの最小の共有部品(純粋関数)。
 *
 * ★なぜ要るか(2026-09-14)
 *   escapeHtml は supportTimelineHtml.js / venueBar.js に、safeHttpUrl は
 *   eventRankingReportModel.js に、同じ本体の sanitizeHttpUrl が4ファイルに、
 *   と【同じ関数が7箇所】に散っていた。2026-09-06 にも別の5関数(esc / num /
 *   safeHttpUrl / retentionRate / freshnessText)を /live/ で重複実装した実害がある。
 *   web-ios-android/CLAUDE.md 基準⑥「2箇所目を書く前に1つ目を呼び出せないか」に
 *   従い、ここを正本(ESTABLISH_REHOME)にする。★新しく同じものを書かず、ここを import する。
 *
 * ■ この箱に入るもの: 「文字列 → HTML に安全に置ける文字列」の変換だけ。
 *   URL の意味的な検疫(ニコ生ユーザーページだけ通す等)は各 API モジュールの責務で、ここには入れない。
 */

/**
 * HTML の特殊文字 5 種を実体参照にする。
 * ★これは「タグとして解釈されない」だけを保証する。href/src に入れる値は safeHttpUrl も通すこと
 *   (javascript: は < > " ' を含まないので、エスケープしても href として有効なまま)。
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * http(s) で始まる URL だけ通す。それ以外(javascript: / data: / 相対 / 空)は '' に倒す。
 * @param {unknown} v
 * @returns {string}
 */
export function safeHttpUrl(v) {
  const s = String(v == null ? '' : v).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * 整数を日本語ロケールの桁区切りで(12757 → "12,757")。数にならないものは "0"。
 * @param {unknown} n
 * @returns {string}
 */
export function formatNumberJa(n) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('ja-JP');
}
