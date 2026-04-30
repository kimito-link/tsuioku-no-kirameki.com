/**
 * 日時の数値（epoch ms）を日本語ロケールで `YYYY/MM/DD HH:MM:SS` 形式に整形する
 * 純粋関数。ゼロ・負・NaN・型不正は `-` を返す。
 *
 * 設計（0.1.35 AJ: popup-entry.js コンポーネント分割の最初の一歩）:
 *   - popup-entry.js 内に長らく置かれていた局所ヘルパを lib に切り出し、
 *     HTML レポート / マーケ分析 / 他の lib 等から再利用できるようにする。
 *   - 日付フォーマットだけの純粋関数。chrome / DOM / IDB 依存なし。
 */

/**
 * @param {number|string|null|undefined} value epoch ms（または string で数値）
 * @returns {string} `2026/04/30 12:34:56` 形式 または `-`
 */
export function formatDateTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  try {
    return new Date(n).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '-';
  }
}
