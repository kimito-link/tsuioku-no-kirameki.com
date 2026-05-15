/**
 * 北極星「広告ランキング」レーン用: watch の番組統計と一覧の「貢」の内訳を短い HTML にする。
 */

/**
 * @param {unknown} v
 * @returns {v is number}
 */
function isFiniteNonNeg(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * @param {{
 *   programAdPts?: unknown,
 *   rankingContributionSum: unknown,
 *   rankingRowCount: unknown
 * }} opts
 * @returns {string} 空のときは空文字
 */
export function buildNorthStarAdRankingStatsHtml(opts) {
  const n = Math.max(0, Math.floor(Number(opts?.rankingRowCount) || 0));
  if (n <= 0) return '';

  const sumRaw = opts?.rankingContributionSum;
  const sum =
    typeof sumRaw === 'number' && Number.isFinite(sumRaw) ? Math.max(0, Math.floor(sumRaw)) : null;
  const program = isFiniteNonNeg(opts?.programAdPts) ? /** @type {number} */ (opts.programAdPts) : null;

  const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('ja-JP') : '—');
  const sumTxt = sum != null ? fmt(sum) : '—';

  const rows = [];
  rows.push(
    '<div class="nl-north-star-ad-stats__row">' +
      '<dt>watch の広告pt</dt>' +
      `<dd>${program != null ? fmt(program) : '—'}</dd>` +
      '</div>'
  );
  rows.push(
    '<div class="nl-north-star-ad-stats__row">' +
      '<dt>一覧の「貢」合計</dt>' +
      `<dd>${sumTxt}<span class="nl-north-star-ad-stats__suffix">（${n}件）</span></dd>` +
      '</div>'
  );

  return `<dl class="nl-north-star-ad-stats" aria-label="数値の内訳">${rows.join('')}</dl>`;
}
