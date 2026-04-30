/**
 * コメントの時系列粒度集計と「アヘ顔密度（L4 笑いの瞬間検出）」を純粋関数で計算する。
 *
 * 設計（0.1.22 W: マーケ分析有料コア / ラテラル思考 L4）:
 *   - `buildCommentVelocityTimeline` は X ミリ秒粒度の bucket と
 *     N 分 rolling 平均を返す（既存 r.timeline とは別 view、グラフ専用）。
 *   - `buildLaughterDensityTimeline` は X ミリ秒粒度で「笑い系コメ密度」を返す。
 *     w / ｗ / 草 / 8888 / 笑 / 爆笑 / ワロタ などのパターンマッチ（簡易）。
 */

/**
 * @typedef {{ capturedAt?: any, text?: any }} VelocityCommentInput
 */

/**
 * @typedef {{
 *   minute: number,
 *   atStart: number,
 *   count: number,
 *   rolling5: number
 * }} VelocityBucket
 */

/**
 * @typedef {{
 *   buckets: VelocityBucket[],
 *   peakValue: number,
 *   peakMinute: number|null,
 *   totalCount: number
 * }} CommentVelocityTimeline
 */

/**
 * @param {VelocityCommentInput[]} comments
 * @returns {{ valid: VelocityCommentInput[], firstAt: number, lastAt: number }|null}
 */
function collectValidSorted(comments) {
  const list = Array.isArray(comments) ? comments : [];
  /** @type {VelocityCommentInput[]} */
  const valid = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const at = /** @type {any} */ (c).capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    valid.push(c);
  }
  if (!valid.length) return null;
  valid.sort(
    (a, b) =>
      /** @type {number} */ (a.capturedAt) - /** @type {number} */ (b.capturedAt)
  );
  return {
    valid,
    firstAt: /** @type {number} */ (valid[0].capturedAt),
    lastAt: /** @type {number} */ (valid[valid.length - 1].capturedAt)
  };
}

/**
 * @param {VelocityCommentInput[]} comments
 * @param {{ bucketMs?: number, rollingWindowMin?: number }} [opts]
 * @returns {CommentVelocityTimeline}
 */
export function buildCommentVelocityTimeline(comments, opts = {}) {
  const bucketMs =
    typeof opts.bucketMs === 'number' && opts.bucketMs > 0 ? opts.bucketMs : 60_000;
  const rollingWindowMin =
    typeof opts.rollingWindowMin === 'number' && opts.rollingWindowMin > 0
      ? opts.rollingWindowMin
      : 5;
  const collected = collectValidSorted(comments);
  if (!collected) return { buckets: [], peakValue: 0, peakMinute: null, totalCount: 0 };

  const { valid, firstAt, lastAt } = collected;
  const totalBuckets = Math.max(1, Math.floor((lastAt - firstAt) / bucketMs) + 1);
  /** @type {VelocityBucket[]} */
  const buckets = [];
  for (let m = 0; m < totalBuckets; m++) {
    buckets.push({ minute: m, atStart: firstAt + m * bucketMs, count: 0, rolling5: 0 });
  }
  for (const c of valid) {
    const idx = Math.floor((/** @type {number} */ (c.capturedAt) - firstAt) / bucketMs);
    if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
  }

  // rolling N-min (over the latest N buckets ending at i)
  const win = rollingWindowMin;
  for (let i = 0; i < buckets.length; i++) {
    const start = Math.max(0, i - win + 1);
    let sum = 0;
    let n = 0;
    for (let j = start; j <= i; j++) {
      sum += buckets[j].count;
      n += 1;
    }
    buckets[i].rolling5 = n > 0 ? Math.round((sum / n) * 100) / 100 : 0;
  }

  let peakValue = 0;
  let peakMinute = null;
  for (const b of buckets) {
    if (b.count > peakValue) {
      peakValue = b.count;
      peakMinute = b.minute;
    }
  }

  return { buckets, peakValue, peakMinute, totalCount: valid.length };
}

/**
 * 笑い系コメ判定（簡易・配信文化向け）。
 *  - "w" / "ｗ" の繰り返し（2文字以上）
 *  - "8888..." の数字 4 桁以上の "8" 連続（1 桁 8 はカウントしない）
 *  - 「草」（先頭に "草" を含む短文 or 単独）
 *  - 「笑」「爆笑」「ワロタ」「(笑)」
 * @param {string} text
 * @returns {boolean}
 */
export function isLaughterText(text) {
  const s = String(text || '');
  if (!s) return false;
  // w / ｗ の連続（2 文字以上）
  if (/^[wｗ]{2,}$/i.test(s.trim())) return true;
  if (/[wｗ]{2,}/i.test(s)) {
    // 文中に ww 含む（"なんかwww" 等）
    return true;
  }
  // 8888+
  if (/8{4,}/.test(s)) return true;
  // 「草」関連（草+末尾の促音/感嘆/句読点/空白のみ許容、全角空白は  ）
  // 全角空白( ) は ESLint no-irregular-whitespace を避けるため Unicode escape で記述
  if (new RegExp("^草[ァァっぁぁ！？!?。、  ]*$").test(s.trim())) return true;
  if (s === '草') return true;
  if (/草不可避|大草原|草生える|草生やす/.test(s)) return true;
  // 笑系
  if (/(?:^|[^一-龥])(笑)(?:[^一-龥]|$)/.test(s)) return true;
  if (/\(笑\)|（笑）/.test(s)) return true;
  if (/爆笑|ワロタ|わろた|ｗｗ/i.test(s)) return true;
  return false;
}

/**
 * @typedef {{
 *   minute: number,
 *   atStart: number,
 *   count: number,
 *   total: number,
 *   ratio: number
 * }} LaughterBucket
 */

/**
 * @typedef {{
 *   buckets: LaughterBucket[],
 *   peakBucket: number|null,
 *   peakValue: number,
 *   totalLaughter: number,
 *   totalCount: number,
 *   overallRatio: number
 * }} LaughterDensityTimeline
 */

/**
 * L4: 30秒（既定）粒度で「笑い系コメ密度」を返す。
 * @param {VelocityCommentInput[]} comments
 * @param {{ bucketMs?: number }} [opts]
 * @returns {LaughterDensityTimeline}
 */
export function buildLaughterDensityTimeline(comments, opts = {}) {
  const bucketMs =
    typeof opts.bucketMs === 'number' && opts.bucketMs > 0 ? opts.bucketMs : 30_000;
  const collected = collectValidSorted(comments);
  if (!collected) {
    return {
      buckets: [],
      peakBucket: null,
      peakValue: 0,
      totalLaughter: 0,
      totalCount: 0,
      overallRatio: 0
    };
  }
  const { valid, firstAt, lastAt } = collected;
  const totalBuckets = Math.max(1, Math.floor((lastAt - firstAt) / bucketMs) + 1);
  /** @type {LaughterBucket[]} */
  const buckets = [];
  for (let m = 0; m < totalBuckets; m++) {
    buckets.push({ minute: m, atStart: firstAt + m * bucketMs, count: 0, total: 0, ratio: 0 });
  }
  let totalLaughter = 0;
  for (const c of valid) {
    const idx = Math.floor((/** @type {number} */ (c.capturedAt) - firstAt) / bucketMs);
    if (idx < 0 || idx >= buckets.length) continue;
    buckets[idx].total += 1;
    if (isLaughterText(/** @type {any} */ (c).text)) {
      buckets[idx].count += 1;
      totalLaughter += 1;
    }
  }
  let peakValue = 0;
  let peakBucket = null;
  for (const b of buckets) {
    b.ratio = b.total > 0 ? Math.round((b.count / b.total) * 1000) / 1000 : 0;
    if (b.count > peakValue) {
      peakValue = b.count;
      peakBucket = b.minute;
    }
  }
  return {
    buckets,
    peakBucket,
    peakValue,
    totalLaughter,
    totalCount: valid.length,
    overallRatio: valid.length > 0 ? Math.round((totalLaughter / valid.length) * 1000) / 1000 : 0
  };
}
