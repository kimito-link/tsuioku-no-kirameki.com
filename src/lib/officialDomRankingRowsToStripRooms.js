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
 *   rankHint?: number|null,
 *   hideIdLine?: boolean,
 *   hasNoIcon?: boolean
 * }} OfficialStripRoom
 */

/**
 * `userPageUrl`（公式 API が記名行に返す）から niconico ユーザー uid を取り出す。
 * 公式提供値の検疫のみ＝推測しない。`https://www.nicovideo.jp/user/<digits>` のみ受理。
 * @param {unknown} value
 * @returns {string} 数値 uid（受理時）または ''
 */
function extractNicoUidFromUserPageUrl(value) {
  const s = String(value == null ? '' : value).trim();
  const m = s.match(/^https:\/\/www\.nicovideo\.jp\/user\/(\d{1,18})\/?$/i);
  return m ? m[1] : '';
}

/**
 * 公式 DOM/API 行の表示名。通常は `name` だが、DOM 差分で `.name` が空でも
 * user icon の alt/title 側に広告主名が入ることがあるため、alt 系フィールドを
 * fallback として受ける。
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function pickOfficialRankDisplayName(row) {
  const fields = ['name', 'thumbnailAltName', 'thumbnailAlt', 'avatarAlt', 'imageAlt', 'alt'];
  for (const f of fields) {
    const s = String(row[f] == null ? '' : row[f]).trim();
    if (s) return s;
  }
  return '';
}

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
    const displayName = pickOfficialRankDisplayName(row);
    const contribution = Number(row.contribution) || 0;
    const rankRaw = row.rank;
    const rankHint =
      typeof rankRaw === 'number' && Number.isFinite(rankRaw) && rankRaw > 0
        ? Math.floor(rankRaw)
        : null;
    // v0.1.316: 記名行に公式 API 由来の userPageUrl があれば、その uid を userKey に
    // 採用する＝既存 topSupportRankLineModels の数値 uid リンク経路がそのまま発火し、
    // 公式が出している確証ありの user ページリンク + アバターになる（推測ゼロ）。
    // 匿名行・uid 無し行は従来どおり合成キー（リンク化されない）＝挙動不変・fail-soft。
    const officialUid = isAnonymous ? '' : extractNicoUidFromUserPageUrl(row.userPageUrl);
    const anonKey = kind === 'ad' ? `__anon_ad_${i}` : `__anon_contrib_${i}`;
    const namedKey =
      kind === 'ad'
        ? `__ad_${i}_${displayName.slice(0, 12)}`
        : `__contrib_${i}_${displayName.slice(0, 12)}`;
    return {
      userKey: officialUid || (isAnonymous ? anonKey : namedKey),
      nickname: displayName,
      count: contribution,
      avatarUrl: thumb,
      ...(rankHint != null ? { rankHint } : {}),
      ...(officialUid && displayName ? { hideIdLine: true } : {}),
      // ★v0.1.1307: 「公式がアイコン未設定と言っている」事実を下流へ素通しする。
      //   これが無いと広告段が uid から CDN URL を導出し、実体が無く 404=白丸になる。
      ...(row.hasNoIcon === true ? { hasNoIcon: true } : {})
    };
  });
}
