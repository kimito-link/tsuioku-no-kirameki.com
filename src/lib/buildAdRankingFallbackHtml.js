/**
 * v0.1.252+: 北極星 +α 広告ランキングレーン用の structured-data fallback HTML 生成。
 *
 * 経緯:
 *   v0.1.237 で「鏡のように貼り付け」rendering を導入し、bundle.adRankingMirrorHtml
 *   が居る時だけ popup レーンに描画する仕様にした。しかし adRankingMirrorHtml は
 *   HTTP fetch (`fetchNicoadContributionRankingFromPublishPage`) が SSR empty で
 *   ほぼ常に null になる事情があり、structured `adContributionRanking` (5 件) が
 *   bundle に居ても popup が空白になる回帰が発生していた。
 *   実機 lv350507546 (こひめろさん配信、2026-05-11 kimito さん診断) で確認。
 *
 *   本関数は「鏡が無いときの最後の砦」として、structured items から niconico
 *   公式値をそのまま転載する簡易 HTML を組み立てる。鏡原則の延長：
 *     - 公式値（rank / name / contribution の数値）は無加工で表示
 *     - 単位「貢」も niconico 表現そのまま
 *     - 集計や解釈は一切しない（並び順は scrape 順を踏襲、上位 N 件で truncate）
 *   `mirrorSanitize` の制約も適用可能な簡素な HTML 構造にする。
 *
 * 純関数。副作用なし。input 不変。
 */

/**
 * @typedef {{
 *   rank?: unknown,
 *   name?: unknown,
 *   contribution?: unknown,
 *   isAnonymous?: unknown,
 *   thumbnailUrl?: unknown
 * }} StructuredRankingItem
 */

/**
 * 表示する上位件数。niconico の `.content-supporter-section ul.wrapper > li.item` は
 * 通常 5 件で、それ以上は別 UI に分かれる。fallback も 5 件で十分。
 */
const FALLBACK_MAX_ROWS = 5;

/**
 * @param {unknown} input
 * @returns {string|null} fallback HTML、または null（items が空 or 全行欠落）
 */
export function buildAdRankingFallbackHtml(input) {
  if (!Array.isArray(input) || input.length === 0) return null;

  /** @type {string[]} */
  const rows = [];
  for (let i = 0; i < input.length && rows.length < FALLBACK_MAX_ROWS; i++) {
    const item = /** @type {StructuredRankingItem} */ (input[i] || {});
    const rank = toFiniteIntOrNull(item.rank);
    const contribution = toFiniteIntOrNull(item.contribution);
    const nameRaw = typeof item.name === 'string' ? item.name.trim() : '';
    // 完全に空 (rank・contribution・name すべて欠落) は skip。`isAnonymous: true` が
    // 単独で来るパターンは現実には無いので「データが何か入っている」境界線とする。
    if (rank == null && contribution == null && !nameRaw) continue;
    const isAnon = item.isAnonymous === true || nameRaw === '名無し' || !nameRaw;

    const rankPart =
      rank != null
        ? `<span class="nl-ad-fallback-row__rank">${escapeHtml(String(rank))}</span>`
        : '';
    const nameLabel = isAnon ? '名無し' : nameRaw;
    const namePart = `<span class="nl-ad-fallback-row__name${
      isAnon ? ' nl-ad-fallback-row__name--anon' : ''
    }">${escapeHtml(nameLabel || '名無し')}</span>`;
    const contribPart =
      contribution != null
        ? `<span class="nl-ad-fallback-row__contrib">${escapeHtml(
            contribution.toLocaleString('en-US')
          )} 貢</span>`
        : '';
    rows.push(
      `<li class="nl-ad-fallback-row">${rankPart}${namePart}${contribPart}</li>`
    );
  }

  if (rows.length === 0) return null;

  return [
    '<ol class="nl-ad-fallback">',
    rows.join(''),
    '</ol>',
    '<p class="nl-ad-fallback__note">niconico の構造化値を表示中（鏡 HTML 取得待ち）</p>'
  ].join('');
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function toFiniteIntOrNull(v) {
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < 0) return null;
  return n;
}

/**
 * 最小 HTML escaper（mirrorSanitize は popup-entry.js 側で適用するため、ここでは
 * 二重エスケープを避けて & < > " ' のみ）。
 *
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
