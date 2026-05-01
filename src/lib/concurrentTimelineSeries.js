/**
 * 同接推移カーブ（視聴維持率の核）の時系列データを純粋関数で構築する。
 *
 * 設計（0.1.22 W: マーケ分析有料コア）:
 *   `broadcastSessionSummary_v1` IDB に蓄積されている放送中サンプル
 *   （`BroadcastSessionSummaryRow`）を時系列で並べ、`officialViewerCount`
 *   （取れていれば最優先）か `peakConcurrentEstimate`（fallback）の値を
 *   line chart 用のポイント列に変換する。
 *
 * 注意: 個別 viewer の入退場は取れないので、YouTube/Twitch 流の per-viewer
 * retention にはならない。代わりに「同接の時間推移カーブ」と
 * `concurrentPeakAnalysis` を組み合わせて「ピーク到達 / 半減点 / 終了保持率」を
 * 出すことで、配信全体の視聴維持の特性を可視化する。
 */

/**
 * @typedef {{
 *   capturedAt?: number,
 *   officialViewerCount?: number|null,
 *   peakConcurrentEstimate?: number|null
 * }} ConcurrentTimelineRow
 */

/**
 * @typedef {{
 *   at: number,
 *   value: number,
 *   minute: number
 * }} ConcurrentTimelinePoint
 */

/**
 * @typedef {{
 *   points: ConcurrentTimelinePoint[],
 *   maxValue: number,
 *   firstAt: number|null,
 *   lastAt: number|null,
 *   source: 'official' | 'estimated' | 'mixed' | 'none'
 * }} ConcurrentTimelineSeries
 */

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isFiniteNonNegative(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * @param {ConcurrentTimelineRow[] | null | undefined} rows
 * @returns {ConcurrentTimelineSeries}
 */
export function buildConcurrentTimelineSeries(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return { points: [], maxValue: 0, firstAt: null, lastAt: null, source: 'none' };
  }

  /*
   * 0.1.47 (AC): hybrid モードに変更。
   *   旧コードは「official が 1 件以上あれば全 official、無ければ全 estimated」の
   *   二者択一だった。ところが配信中に official が 1 件でも入った瞬間 source は
   *   official になり、official が無い 90% の estimated 行がすべて捨てられる。
   *   結果「2 サンプルしかない」グラフになり sectionConcurrentTimeline が
   *   `series.points.length < 2` で空表示になっていた。
   *   新方針: 各行で official 優先 → 無ければ estimated に fallback。
   *   集約 source は all-official / all-estimated / 混在で `mixed` を返す。
   */
  let officialCount = 0;
  let estimatedCount = 0;
  /** @type {{ at: number, value: number, kind: 'official'|'estimated' }[]} */
  const collected = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.capturedAt !== 'number' || !Number.isFinite(r.capturedAt)) continue;
    if (isFiniteNonNegative(r.officialViewerCount)) {
      collected.push({
        at: r.capturedAt,
        value: /** @type {number} */ (r.officialViewerCount),
        kind: 'official'
      });
      officialCount += 1;
    } else if (isFiniteNonNegative(r.peakConcurrentEstimate)) {
      collected.push({
        at: r.capturedAt,
        value: /** @type {number} */ (r.peakConcurrentEstimate),
        kind: 'estimated'
      });
      estimatedCount += 1;
    }
  }
  if (!collected.length) {
    return { points: [], maxValue: 0, firstAt: null, lastAt: null, source: 'none' };
  }
  collected.sort((a, b) => a.at - b.at);
  /** @type {'official' | 'estimated' | 'mixed' | 'none'} */
  const source =
    officialCount > 0 && estimatedCount > 0
      ? 'mixed'
      : officialCount > 0
        ? 'official'
        : 'estimated';

  const firstAt = collected[0].at;
  const lastAt = collected[collected.length - 1].at;
  let maxValue = 0;
  /** @type {ConcurrentTimelinePoint[]} */
  const points = collected.map((p) => {
    if (p.value > maxValue) maxValue = p.value;
    return {
      at: p.at,
      value: p.value,
      minute: Math.max(0, Math.floor((p.at - firstAt) / 60_000))
    };
  });

  return { points, maxValue, firstAt, lastAt, source };
}
