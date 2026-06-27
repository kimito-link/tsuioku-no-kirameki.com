// セッションサマリ推移テーブル（renderSessionSummaryComparePanel の <table>）の HTML を組む純関数。
//   popup-entry.js:renderSessionSummaryComparePanel から「rows → テーブル HTML 文字列」部分だけ抽出
//   （pure refactor・挙動不変）。IDB の open/read・mount.innerHTML 代入・空状態文言は popup に残す。
//   依存は既存 lib（htmlEscape）のみ＝循環 import なし。
import { escapeHtml } from './htmlEscape.js';

const TABLE_HEADER =
  '<table class="nl-session-summary-table"><thead><tr>' +
  '<th>時刻</th><th>記録コメント</th><th>ユニークUID</th><th>ギフトユーザー</th><th>同接推定</th><th>公式コメ</th>' +
  '</tr></thead><tbody>';

/**
 * セッションサマリ行配列をテーブル HTML に整形する。
 *   ★時刻整形はロケール依存（toLocaleString）なので注入可能にする＝テストは決定的なフォーマッタで固定し、
 *     本番は既定（抽出前と同一の `new Date(ms).toLocaleString('ja-JP')`）でバイト一致を保つ。
 *
 * @param {Array<{ capturedAt: number, commentStorageCount: number, uniqueKnownCommenters: number,
 *   giftUserCount: number, peakConcurrentEstimate: number|null, officialCommentCount: number|null }>} rows
 * @param {{ formatTime?: (ms: number) => string }} [opts]
 * @returns {string} `<table>…</table>` 文字列
 */
export function buildSessionSummaryCompareTableHtml(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const formatTime =
    typeof opts.formatTime === 'function'
      ? opts.formatTime
      : (/** @type {number} */ ms) => new Date(ms).toLocaleString('ja-JP');
  const body = list
    .map((r) => {
      const t = formatTime(r.capturedAt);
      const peak =
        r.peakConcurrentEstimate != null && Number.isFinite(r.peakConcurrentEstimate)
          ? String(r.peakConcurrentEstimate)
          : '—';
      const oc =
        r.officialCommentCount != null && Number.isFinite(r.officialCommentCount)
          ? String(r.officialCommentCount)
          : '—';
      return `<tr><td>${escapeHtml(t)}</td><td>${r.commentStorageCount}</td><td>${r.uniqueKnownCommenters}</td><td>${r.giftUserCount}</td><td>${escapeHtml(peak)}</td><td>${escapeHtml(oc)}</td></tr>`;
    })
    .join('');
  return `${TABLE_HEADER}${body}</tbody></table>`;
}
