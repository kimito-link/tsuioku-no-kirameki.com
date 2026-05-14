/**
 * MCP / L1 向けに貢献度・広告ランキングの **PII 最小スナップショット** を組み立てる。
 * 表示名・URL は含めず、順位・pt・匿名フラグのみ（調査・AI 参照用）。
 *
 * @typedef {{
 *   rank?: number|null,
 *   contribution?: number|null,
 *   isAnonymous?: boolean
 * }} ContributionLikeRow
 */

const DEFAULT_MAX_ROWS = 8;

/**
 * @param {unknown} row
 * @returns {{ rank: number|null, contribution: number|null, isAnonymous: boolean }|null}
 */
function sanitizeRankingRow(row) {
  if (!row || typeof row !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (row);
  const rank =
    typeof o.rank === 'number' && Number.isFinite(o.rank) && o.rank >= 0 ? Math.floor(o.rank) : null;
  let contribution = null;
  if (typeof o.contribution === 'number' && Number.isFinite(o.contribution)) {
    contribution = Math.floor(o.contribution);
  }
  const isAnonymous = !!o.isAnonymous;
  if (rank == null && contribution == null) return null;
  return { rank, contribution, isAnonymous };
}

/**
 * @param {unknown} list
 * @param {number} maxRows
 * @returns {{ rowCount: number, rows: Array<{ rank: number|null, contribution: number|null, isAnonymous: boolean }>, truncated: boolean }|null}
 */
function buildSideSnippet(list, maxRows) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const truncated = list.length > maxRows;
  const slice = list.slice(0, maxRows);
  /** @type {Array<{ rank: number|null, contribution: number|null, isAnonymous: boolean }>} */
  const rows = [];
  for (const raw of slice) {
    const r = sanitizeRankingRow(raw);
    if (r) rows.push(r);
  }
  if (!rows.length) return null;
  return {
    rowCount: list.length,
    rows,
    truncated
  };
}

/**
 * `OfficialEventDomBundle` 互換オブジェクトから MCP 用ランキング断片を生成する。
 * bundle が無効・両ランキングとも空なら `null`。
 *
 * @param {unknown} bundle
 * @param {{ maxRows?: number }} [opts]
 * @returns {{
 *   bundleCapturedAt: number|null,
 *   contribution: NonNullable<ReturnType<typeof buildSideSnippet>>,
 *   ad: NonNullable<ReturnType<typeof buildSideSnippet>>
 * }|null}
 */
export function buildMcpRankingSnippetFromBundle(bundle, opts = {}) {
  if (!bundle || typeof bundle !== 'object') return null;
  const b = /** @type {Record<string, unknown>} */ (bundle);
  const maxRows =
    typeof opts.maxRows === 'number' && Number.isFinite(opts.maxRows) && opts.maxRows > 0
      ? Math.min(Math.floor(opts.maxRows), 32)
      : DEFAULT_MAX_ROWS;

  const bundleCapturedAt =
    typeof b.capturedAt === 'number' && Number.isFinite(b.capturedAt) && b.capturedAt > 0
      ? b.capturedAt
      : null;

  const contribution = buildSideSnippet(b.contributionRanking, maxRows);
  const ad = buildSideSnippet(b.adContributionRanking, maxRows);
  if (!contribution && !ad) return null;

  return {
    bundleCapturedAt,
    contribution: contribution || { rowCount: 0, rows: [], truncated: false },
    ad: ad || { rowCount: 0, rows: [], truncated: false }
  };
}
