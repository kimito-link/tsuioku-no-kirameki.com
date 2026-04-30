/**
 * 同接推移カーブから「ピーク到達 / 終了時保持率 / 半減点」を求める純粋関数。
 *
 * 設計（0.1.22 W: マーケ分析有料コア）:
 *   - peakValue / peakMinute … 同接最大値とその経過分（同点なら最初の出現）
 *   - startValue              … 最初のサンプル値
 *   - endValue                … 最後のサンプル値
 *   - endRetentionRatio       … endValue / peakValue（peak=0 のときは null）
 *   - halfDecayMinute         … ピーク後に最初に「ピークの 50% を割った」分
 *                                （ピーク後にそのような点が無ければ null）
 *
 *   "視聴維持率" の代替指標として、配信全体の同接挙動を 1 行で要約できる。
 */

/**
 * @typedef {import('./concurrentTimelineSeries.js').ConcurrentTimelinePoint} ConcurrentTimelinePoint
 * @typedef {import('./concurrentTimelineSeries.js').ConcurrentTimelineSeries} ConcurrentTimelineSeries
 */

/**
 * @typedef {{
 *   peakValue: number,
 *   peakMinute: number|null,
 *   startValue: number,
 *   endValue: number,
 *   endRetentionRatio: number|null,
 *   halfDecayMinute: number|null
 * }} ConcurrentPeakAnalysis
 */

const EMPTY = Object.freeze({
  peakValue: 0,
  peakMinute: null,
  startValue: 0,
  endValue: 0,
  endRetentionRatio: null,
  halfDecayMinute: null
});

/**
 * @param {ConcurrentTimelineSeries | null | undefined} series
 * @returns {ConcurrentPeakAnalysis}
 */
export function analyzeConcurrentPeak(series) {
  if (!series || typeof series !== 'object') return { ...EMPTY };
  const points = Array.isArray(series.points) ? series.points : [];
  if (!points.length) return { ...EMPTY };

  // ピーク到達点（最初に最大値に到達した index）
  let peakValue = points[0].value;
  let peakIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].value > peakValue) {
      peakValue = points[i].value;
      peakIdx = i;
    }
  }
  const peak = points[peakIdx];
  const start = points[0];
  const end = points[points.length - 1];

  const endRetentionRatio =
    peakValue > 0 ? Math.round((end.value / peakValue) * 1000) / 1000 : null;

  // ピーク後に最初に「ピークの 50% 未満」になった分
  /** @type {number|null} */
  let halfDecayMinute = null;
  if (peakValue > 0) {
    const threshold = peakValue / 2;
    for (let i = peakIdx + 1; i < points.length; i++) {
      if (points[i].value < threshold) {
        halfDecayMinute = points[i].minute;
        break;
      }
    }
  }

  return {
    peakValue,
    peakMinute: peak.minute,
    startValue: start.value,
    endValue: end.value,
    endRetentionRatio,
    halfDecayMinute
  };
}
