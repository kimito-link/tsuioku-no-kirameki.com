/**
 * 複合シグナルによる同時接続数推定モジュール。
 *
 * ニコ生には同時接続 API がないため、複数の統計指標から推定する。
 *
 * Signal A: アクティブコメンター法
 *   直近5分のユニークコメンター数 × 動的倍率
 *   倍率は来場者数に応じて上昇（大規模配信ほどコメント参加率が下がるため）
 *
 * Signal B: 滞留率法
 *   累計来場者数 × 時間経過による滞留率
 *   指数減衰モデル: rate = max(0.08, 0.48 × exp(-0.005 × ageMin))
 *
 * 統合: 幾何平均 √(A × B) で両シグナルの偏りを中和
 *
 * 較正データ（ちくわちゃんランキングpoints ≈ 同時接続の代理指標として使用）:
 *   でかもも: 30 active, 2580 visitors → 305 pts → m ≈ 10
 *   あかねこ: 60 active, 8754 visitors → 929 pts → m ≈ 15
 */

/** @type {number} */
export const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

/**
 * statistics.viewers 更新間隔ヒントが無いときの「直接値」許容経過時間。
 * watch ページでは WebSocket の statistics がしばしば 45–90s 程度の間隔で来るため、
 * 1 ティック遅延でも UI が official→nowcast に落ちにくいよう ~60s 帯の 1.5 倍を既定とする。
 */
export const DIRECT_VIEWERS_FRESH_MS = 90 * 1000;

/**
 * ヒント無し時の nowcast 上限（これを超えた経過はフォールバック）。
 * 約 3.5 ティック分の猶予（60s 想定）で、遅延配信でも短期補間を試みる。
 */
export const DIRECT_VIEWERS_NOWCAST_MAX_MS = 210 * 1000;

/**
 * 動的倍率テーブル（来場者数 → 倍率）
 * ちくわちゃんランキングとの較正に基づく。
 *
 * 較正: でかもも(2580→m≈10), あかねこ(8754→m≈15)
 * 外挿: lurker effect により大規模ほど倍率上昇
 *
 * @type {ReadonlyArray<readonly [number, number]>}
 */
const MULTIPLIER_TABLE = /** @type {const} */ ([
  [50, 4],
  [200, 5],
  [500, 6],
  [1000, 7],
  [3000, 10],
  [8000, 15],
  [20000, 20],
  [50000, 25],
]);

/**
 * active_only モード時の来場者比率ソフトキャップ。
 * streamAge 不明の場合、推定値が visitors × この値を超えないようにする。
 * 高エンゲージメント配信での過大推定を防ぐ安全弁。
 * @type {number}
 */
const VISITOR_SOFT_CAP_RATIO = 0.35;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * statistics.viewers の実測更新間隔ヒントがある場合の freshness 閾値を返す。
 * @param {number|undefined|null} officialViewerIntervalMs
 * @returns {{ freshMs: number, nowcastMaxMs: number }}
 */
export function resolveDirectViewersThresholds(officialViewerIntervalMs) {
  const hinted =
    typeof officialViewerIntervalMs === 'number' &&
    Number.isFinite(officialViewerIntervalMs) &&
    officialViewerIntervalMs > 0
      ? officialViewerIntervalMs
      : null;
  if (hinted == null) {
    return {
      freshMs: DIRECT_VIEWERS_FRESH_MS,
      nowcastMaxMs: DIRECT_VIEWERS_NOWCAST_MAX_MS
    };
  }
  const freshMs = clamp(Math.round(hinted * 1.6), 45_000, 120_000);
  const nowcastMaxMs = clamp(
    Math.round(hinted * 4),
    freshMs + 45_000,
    5 * 60 * 1000
  );
  return { freshMs, nowcastMaxMs };
}

/**
 * 来場者数から動的倍率を算出（対数補間）。
 * @param {number|undefined|null} totalVisitors
 * @returns {number}
 */
export function dynamicMultiplier(totalVisitors) {
  if (typeof totalVisitors !== 'number' || !Number.isFinite(totalVisitors) || totalVisitors <= 0) {
    return 7;
  }
  const T = MULTIPLIER_TABLE;
  if (totalVisitors <= T[0][0]) return T[0][1];
  if (totalVisitors >= T[T.length - 1][0]) return T[T.length - 1][1];

  for (let i = 0; i < T.length - 1; i++) {
    if (totalVisitors <= T[i + 1][0]) {
      const [v0, m0] = T[i];
      const [v1, m1] = T[i + 1];
      const t = (Math.log(totalVisitors) - Math.log(v0)) / (Math.log(v1) - Math.log(v0));
      return Math.round((m0 + t * (m1 - m0)) * 10) / 10;
    }
  }
  return 7;
}

/**
 * 配信経過時間から滞留率を算出。
 * 指数減衰: rate = max(floor, peak × exp(-decay × ageMin))
 *
 * 0分: 48%, 30分: 41%, 60分: 35%, 120分: 26%, 180分: 20%, 300分: 11%
 *
 * @param {number} ageMin  配信開始からの経過分数
 * @returns {number} 0–1 の滞留率
 */
export function retentionRate(ageMin) {
  if (typeof ageMin !== 'number' || !Number.isFinite(ageMin) || ageMin < 0) return 0.40;
  return Math.max(0.08, 0.48 * Math.exp(-0.005 * ageMin));
}

/**
 * タイムスタンプ付き userId Map から、指定ウィンドウ内のアクティブユーザー数を返す。
 *
 * @param {ReadonlyMap<string, number>} userTimestamps  userId → lastSeenAt (ms)
 * @param {number} now  現在時刻 (ms)
 * @param {number} [windowMs]  ウィンドウ幅 (ms)。省略時 5 分
 * @returns {number} ウィンドウ内のユニークユーザー数
 */
export function countRecentActiveUsers(userTimestamps, now, windowMs) {
  const w = typeof windowMs === 'number' && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;
  const cutoff = now - w;
  let count = 0;
  for (const ts of userTimestamps.values()) {
    if (ts >= cutoff) count++;
  }
  return count;
}

/**
 * @typedef {{
 *   estimated: number,
 *   activeCommenters: number,
 *   multiplier: number,
 *   capped: boolean,
 *   method: 'combined'|'active_only'|'retention_only'|'none',
 *   signalA: number,
 *   signalB: number,
 *   retentionPct: number|null,
 *   streamAgeMin: number|null
 * }} ConcurrentEstimateResult
 */

/**
 * 複合シグナルで推定同時接続数を計算する。
 *
 * @param {object} params
 * @param {number} params.recentActiveUsers  直近5分のユニークコメンター数
 * @param {number} [params.totalVisitors]    来場者数（倍率計算 + キャップに使用）
 * @param {number} [params.streamAgeMin]     配信経過分数（滞留推定に使用）
 * @param {number} [params.multiplier]       倍率を手動指定する場合（省略時は動的算出）
 * @returns {ConcurrentEstimateResult}
 */
export function estimateConcurrentViewers({
  recentActiveUsers,
  totalVisitors,
  streamAgeMin,
  multiplier
}) {
  const active = typeof recentActiveUsers === 'number' && recentActiveUsers >= 0
    ? Math.floor(recentActiveUsers)
    : 0;

  const hasVisitors = typeof totalVisitors === 'number' && Number.isFinite(totalVisitors) && totalVisitors > 0;
  const hasAge = typeof streamAgeMin === 'number' && Number.isFinite(streamAgeMin) && streamAgeMin >= 0;

  const m = typeof multiplier === 'number' && multiplier > 0
    ? multiplier
    : dynamicMultiplier(hasVisitors ? totalVisitors : null);

  const signalA = active > 0 ? active * m : 0;

  let signalB = 0;
  let retPct = /** @type {number|null} */ (null);
  if (hasVisitors && hasAge) {
    retPct = retentionRate(/** @type {number} */ (streamAgeMin));
    signalB = Math.round(/** @type {number} */ (totalVisitors) * retPct);
  }

  let estimated = 0;
  /** @type {'combined'|'active_only'|'retention_only'|'none'} */
  let method = 'none';

  if (signalA > 0 && signalB > 0) {
    estimated = Math.round(Math.sqrt(signalA * signalB));
    method = 'combined';
  } else if (signalA > 0) {
    estimated = Math.round(signalA);
    method = 'active_only';
  } else if (signalB > 0) {
    estimated = signalB;
    method = 'retention_only';
  }

  let capped = false;
  if (hasVisitors) {
    if (method === 'active_only') {
      const softCap = Math.round(/** @type {number} */ (totalVisitors) * VISITOR_SOFT_CAP_RATIO);
      if (estimated > softCap) {
        estimated = softCap;
        capped = true;
      }
    }
    if (estimated > /** @type {number} */ (totalVisitors)) {
      estimated = /** @type {number} */ (totalVisitors);
      capped = true;
    }
  }

  return {
    estimated,
    activeCommenters: active,
    multiplier: m,
    capped,
    method,
    signalA: Math.round(signalA),
    signalB,
    retentionPct: retPct != null ? Math.round(retPct * 100) : null,
    streamAgeMin: hasAge ? /** @type {number} */ (streamAgeMin) : null,
  };
}

/**
 * statistics.comments の増分に対して、実際に受信できたコメント数の比率を返す。
 * 取得元が無い／増分ゼロのときは「欠落なし」とみなして 1 を返す。
 *
 * @param {object} params
 * @param {number} [params.previousStatisticsComments]
 * @param {number} [params.currentStatisticsComments]
 * @param {number} [params.receivedCommentsDelta]
 * @returns {number}
 */
export function calcCommentCaptureRatio({
  previousStatisticsComments,
  currentStatisticsComments,
  receivedCommentsDelta
}) {
  const prev = Number(previousStatisticsComments);
  const curr = Number(currentStatisticsComments);
  const received = Number(receivedCommentsDelta);
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return 1;
  const statsDelta = curr - prev;
  if (!(statsDelta > 0)) return 1;
  if (!Number.isFinite(received)) return 0;
  return clamp(received / statsDelta, 0, 1);
}

/**
 * @typedef {{
 *   estimated: number,
 *   lower: number,
 *   upper: number,
 *   confidence: number,
 *   method: 'official'|'nowcast'|'fallback',
 *   capped: boolean,
 *   freshnessMs: number|null,
 *   captureRatio: number|null,
 *   base: ConcurrentEstimateResult
 * }} ConcurrentResolutionResult
 */

/**
 * direct viewers → nowcast → 現行推定 fallback の順で同接表示値を解決する。
 *
 * @param {object} params
 * @param {number} [params.nowMs]
 * @param {number} [params.officialViewers]
 * @param {number} [params.officialUpdatedAtMs]
 * @param {number} [params.officialViewerIntervalMs]
 * @param {number} [params.previousStatisticsComments]
 * @param {number} [params.currentStatisticsComments]
 * @param {number} [params.receivedCommentsDelta]
 * @param {number} params.recentActiveUsers
 * @param {number} [params.totalVisitors]
 * @param {number} [params.streamAgeMin]
 * @param {number} [params.multiplier]
 * @returns {ConcurrentResolutionResult}
 */
export function resolveConcurrentViewers({
  nowMs,
  officialViewers,
  officialUpdatedAtMs,
  officialViewerIntervalMs,
  previousStatisticsComments,
  currentStatisticsComments,
  receivedCommentsDelta,
  recentActiveUsers,
  totalVisitors,
  streamAgeMin,
  multiplier
}) {
  const base = estimateConcurrentViewers({
    recentActiveUsers,
    totalVisitors,
    streamAgeMin,
    multiplier
  });

  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
  const official =
    typeof officialViewers === 'number' && Number.isFinite(officialViewers) && officialViewers >= 0
      ? Math.round(officialViewers)
      : null;
  const updatedAt =
    typeof officialUpdatedAtMs === 'number' && Number.isFinite(officialUpdatedAtMs)
      ? officialUpdatedAtMs
      : null;
  const freshnessMs =
    official != null && updatedAt != null ? Math.max(0, now - updatedAt) : null;
  const thresholds = resolveDirectViewersThresholds(officialViewerIntervalMs);
  const captureRatio =
    previousStatisticsComments != null || currentStatisticsComments != null || receivedCommentsDelta != null
      ? calcCommentCaptureRatio({
          previousStatisticsComments,
          currentStatisticsComments,
          receivedCommentsDelta
        })
      : null;
  const capture = captureRatio == null ? 1 : captureRatio;

  if (official != null && freshnessMs != null && freshnessMs <= thresholds.freshMs) {
    return {
      estimated: official,
      lower: official,
      upper: official,
      confidence: 0.98,
      method: 'official',
      capped: false,
      freshnessMs,
      captureRatio,
      base
    };
  }

  if (official != null && freshnessMs != null && freshnessMs <= thresholds.nowcastMaxMs) {
    const freshnessRatio =
      (freshnessMs - thresholds.freshMs) /
      Math.max(1, thresholds.nowcastMaxMs - thresholds.freshMs);
    const driftWeight = clamp(freshnessRatio * (0.35 + capture * 0.65), 0, 0.65);
    const target = base.estimated > 0 ? base.estimated : official;
    const rawEstimate = official + (target - official) * driftWeight;
    const bandRatio = clamp(0.10 + freshnessRatio * 0.08 + (1 - capture) * 0.10, 0.08, 0.30);
    const estimated = clamp(
      Math.round(rawEstimate),
      Math.max(0, Math.round(official * (1 - bandRatio))),
      Math.round(official * (1 + bandRatio))
    );
    const confidence = clamp(
      0.88 - freshnessRatio * 0.18 - (1 - capture) * 0.18,
      0.45,
      0.9
    );
    const rangeRatio = clamp(0.08 + freshnessRatio * 0.10 + (1 - capture) * 0.10, 0.08, 0.32);
    return {
      estimated,
      lower: Math.max(0, Math.round(estimated * (1 - rangeRatio))),
      upper: Math.round(estimated * (1 + rangeRatio)),
      confidence,
      method: 'nowcast',
      capped: base.capped,
      freshnessMs,
      captureRatio,
      base
    };
  }

  const fallbackRangeRatio =
    base.method === 'combined'
      ? 0.20
      : base.method === 'active_only'
        ? 0.28
        : base.method === 'retention_only'
          ? 0.32
          : 0.5;
  const fallbackConfidence =
    base.method === 'combined'
      ? 0.62
      : base.method === 'active_only'
        ? 0.52
        : base.method === 'retention_only'
          ? 0.45
          : 0.2;
  return {
    estimated: base.estimated,
    lower: Math.max(0, Math.round(base.estimated * (1 - fallbackRangeRatio))),
    upper: Math.round(base.estimated * (1 + fallbackRangeRatio)),
    confidence: fallbackConfidence,
    method: 'fallback',
    capped: base.capped,
    freshnessMs,
    captureRatio,
    base
  };
}
