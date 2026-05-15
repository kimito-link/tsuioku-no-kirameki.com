/**
 * 公式イベント DOM バンドルの貢献度／広告ランキング行を、
 * `topSupportRankLineModels` 入力（stripRooms）へ正規化する。
 */

/**
 * @typedef {{
 *   userKey: string,
 *   nickname: string,
 *   count: number,
 *   avatarUrl?: string,
 *   rankHint?: number|null
 * }} OfficialStripRoom
 */

/**
 * @param {unknown[]} ranking `contributionRanking` / `adContributionRanking` の配列
 * @param {{ userKeyKind?: 'contrib' | 'ad' }} [opts]
 * @returns {OfficialStripRoom[]}
 */
export function officialDomRankingRowsToStripRooms(ranking, opts = {}) {
  if (!Array.isArray(ranking)) return [];
  const kind = opts.userKeyKind === 'ad' ? 'ad' : 'contrib';
  return ranking.map((raw, i) => {
    const row = /** @type {Record<string, unknown>} */ (raw && typeof raw === 'object' ? raw : {});
    const isAnonymous = Boolean(row.isAnonymous);
    const thumb = String(row.thumbnailUrl ?? '').trim();
    const contribution = Number(row.contribution) || 0;
    const rankRaw = row.rank;
    const rankHint =
      typeof rankRaw === 'number' && Number.isFinite(rankRaw) && rankRaw > 0
        ? Math.floor(rankRaw)
        : null;
    const anonKey = kind === 'ad' ? `__anon_ad_${i}` : `__anon_contrib_${i}`;
    const namedKey =
      kind === 'ad'
        ? `__ad_${i}_${String(row.name || '').slice(0, 12)}`
        : `__contrib_${i}_${String(row.name || '').slice(0, 12)}`;
    return {
      userKey: isAnonymous ? anonKey : namedKey,
      nickname: String(row.name || ''),
      count: contribution,
      avatarUrl: thumb,
      ...(rankHint != null ? { rankHint } : {})
    };
  });
}
