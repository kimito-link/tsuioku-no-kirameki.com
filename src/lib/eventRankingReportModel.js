/**
 * イベントランキングの「レポート用 正規化モデル」純関数（Phase A・2026-05-26 会議）。
 *
 * storage `nls_event_score_ranking_<lv>` の生データ（scrapeEventScoreRankingFromRichviewDom /
 * scrapeEventSelfStatusFromRichviewDom 由来）を、HTMLレポート / マーケ分析の双方が使える
 * 単一の正規化形に整える。**ここが唯一の真実**（HTML と marketing で重複ロジックを持たない）。
 *
 * 方針:
 *   - 誤値ゼロ・fail-soft: 取れない項目は null/空。順位が確定しない行は落とす。
 *   - サムネ URL は http/https のみ許可（HTML を file:// で開いた時の XSS 経路を断つ＝既存 S-2）。
 *   - capturedAt から「古さ」を付与（レポート出力時に最新が無いことを正直に出せるように）。
 *   - 副作用なし・DOM 非依存（storage から読んだ plain object を渡す）。
 */

/**
 * @typedef {{
 *   rank: number,
 *   score: number,
 *   name: string,
 *   isAnonymous: boolean,
 *   thumbnailUrl: string,
 *   userId?: string,
 * }} EventRankingReportRow
 */

/**
 * @typedef {{
 *   eventName: string,
 *   self: { rank: number|null, score: number|null, diffToNext: number|null, broadcasterName: string } | null,
 *   rows: EventRankingReportRow[],
 *   capturedAt: number|null,
 *   ageMs: number|null,
 *   isStale: boolean,
 * }} EventRankingReportModel
 */

/** レポートに出す上位件数の上限。 */
export const EVENT_RANKING_REPORT_MAX_ROWS = 10;

/** これより古い取得はレポートで「古い」と注記する目安（10 分）。 */
export const EVENT_RANKING_REPORT_STALE_MS = 10 * 60 * 1000;

/**
 * http/https の URL だけ通す（それ以外＝data:/javascript: 等は空に倒す）。
 * @param {unknown} v
 * @returns {string}
 */
function safeHttpUrl(v) {
  const s = String(v == null ? '' : v).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function posIntOrNull(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n > 0 ? n : null;
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function nonNegIntOrNull(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n >= 0 ? n : null;
}

/**
 * storage の生データ（`nls_event_score_ranking_<lv>` の値）を正規化する。
 *
 * @param {unknown} raw storage から読んだ値（object 期待）
 * @param {{ nowMs?: number }} [opts]
 * @returns {EventRankingReportModel|null} 何も出せないとき null
 */
export function buildEventRankingReportModel(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const nowMs = typeof opts.nowMs === 'number' && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();

  // rows
  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  /** @type {EventRankingReportRow[]} */
  const rows = [];
  for (const r of rawRows) {
    if (!r || typeof r !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (r);
    const rank = posIntOrNull(row.rank);
    const score = nonNegIntOrNull(row.score);
    if (rank == null || score == null) continue; // 順位/スコア未確定は落とす（誤値ゼロ）
    const name = String(row.name == null ? '' : row.name).replace(/\s+/g, ' ').trim() || '名無し';
    const isAnonymous = row.isAnonymous === true || name === '名無し';
    const thumbnailUrl = safeHttpUrl(row.thumbnailUrl);
    const userId = String(row.userId == null ? '' : row.userId).trim();
    rows.push({
      rank,
      score,
      name,
      isAnonymous,
      thumbnailUrl,
      ...(userId ? { userId } : {})
    });
  }
  // 先にソートしてから上位 N に切る（入力が逆順でも正しく 1..N を残す）。
  rows.sort((a, b) => a.rank - b.rank);
  if (rows.length > EVENT_RANKING_REPORT_MAX_ROWS) {
    rows.length = EVENT_RANKING_REPORT_MAX_ROWS;
  }

  // selfStatus
  let self = null;
  const rawSelf = obj.selfStatus;
  if (rawSelf && typeof rawSelf === 'object' && !Array.isArray(rawSelf)) {
    const s = /** @type {Record<string, unknown>} */ (rawSelf);
    const rank = posIntOrNull(s.rank);
    const score = nonNegIntOrNull(s.score);
    const diffToNext = nonNegIntOrNull(s.diffToNext);
    const broadcasterName = String(s.broadcasterName == null ? '' : s.broadcasterName).replace(/\s+/g, ' ').trim();
    if (rank != null || score != null || broadcasterName) {
      self = { rank, score, diffToNext, broadcasterName };
    }
  }

  // eventName: selfStatus 優先、無ければ top-level（後方互換）
  const eventName =
    String(
      (rawSelf && typeof rawSelf === 'object' && /** @type {any} */ (rawSelf).eventName) ||
        obj.eventName ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();

  // capturedAt / 古さ
  const capturedAt = typeof obj.capturedAt === 'number' && Number.isFinite(obj.capturedAt) ? obj.capturedAt : null;
  const ageMs = capturedAt != null ? Math.max(0, nowMs - capturedAt) : null;
  const isStale = ageMs != null && ageMs > EVENT_RANKING_REPORT_STALE_MS;

  // 何も無ければ null（イベント不参加・未取得）
  if (rows.length === 0 && !self && !eventName) return null;

  return { eventName, self, rows, capturedAt, ageMs, isStale };
}
