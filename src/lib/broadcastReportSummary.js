/**
 * HTML レポート / マーケ分析の双方で使う「放送全体の純粋集計」。
 *
 * 設計（0.1.21 V: HTML レポート無料拡張）:
 *   - 配信時間 / CPM / 文字数統計 / 184比率 を 1 つのファイルに集約。
 *   - すべて純粋関数で DOM / storage 非依存（vitest で全件テスト可能）。
 *   - 入力の comment は `commentRecord.js` の StoredComment 互換最小形:
 *     `{ capturedAt: number, text: string, userId: string|null, selfPosted?: any }`。
 */

/**
 * @typedef {{
 *   capturedAt?: number|string|null,
 *   text?: string|null,
 *   userId?: string|null,
 *   selfPosted?: any
 * }} ReportCommentInput
 */

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function toFiniteNumberOrNull(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * @param {{ snapshot?: { broadcasterLevel?: number|null } | null, comments: ReportCommentInput[] }} input
 * @returns {{
 *   broadcasterLevel: number|null,
 *   firstCapturedAt: number|null,
 *   lastCapturedAt: number|null,
 *   durationMs: number,
 *   durationMinutes: number,
 *   commentsPerMinute: number
 * }}
 */
export function summarizeBroadcastTiming(input) {
  const snapshot = input?.snapshot ?? null;
  const comments = Array.isArray(input?.comments) ? input.comments : [];

  const lvRaw = snapshot && typeof snapshot === 'object' ? snapshot.broadcasterLevel : null;
  const broadcasterLevel =
    typeof lvRaw === 'number' && Number.isFinite(lvRaw) && lvRaw > 0 ? lvRaw : null;

  /** @type {number|null} */
  let first = null;
  /** @type {number|null} */
  let last = null;
  let validCount = 0;
  for (const c of comments) {
    const at = toFiniteNumberOrNull(c?.capturedAt);
    if (at == null) continue;
    validCount += 1;
    if (first == null || at < first) first = at;
    if (last == null || at > last) last = at;
  }

  const durationMs = first != null && last != null ? last - first : 0;
  const durationMinutes = durationMs / 60_000;
  const commentsPerMinute =
    durationMinutes > 0 && validCount > 1
      ? Math.round((validCount / durationMinutes) * 100) / 100
      : 0;

  return {
    broadcasterLevel,
    firstCapturedAt: first,
    lastCapturedAt: last,
    durationMs,
    durationMinutes,
    commentsPerMinute
  };
}

/**
 * @param {ReportCommentInput[]} comments
 * @returns {{
 *   totalCount: number,
 *   totalChars: number,
 *   averageChars: number,
 *   medianChars: number,
 *   maxChars: number
 * }}
 */
export function summarizeCommentBodyStats(comments) {
  const list = Array.isArray(comments) ? comments : [];
  if (!list.length) {
    return { totalCount: 0, totalChars: 0, averageChars: 0, medianChars: 0, maxChars: 0 };
  }
  /** @type {number[]} */
  const lengths = [];
  let total = 0;
  let max = 0;
  for (const c of list) {
    const len = String(c?.text == null ? '' : c.text).length;
    lengths.push(len);
    total += len;
    if (len > max) max = len;
  }
  lengths.sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  const median =
    lengths.length % 2 === 0
      ? (lengths[mid - 1] + lengths[mid]) / 2
      : lengths[mid];
  const average = Math.round((total / lengths.length) * 100) / 100;
  return {
    totalCount: lengths.length,
    totalChars: total,
    averageChars: average,
    medianChars: median,
    maxChars: max
  };
}

/**
 * @param {ReportCommentInput[]} comments
 * @returns {{
 *   totalCount: number,
 *   numericIdCount: number,
 *   anonymous184Count: number,
 *   selfPostedCount: number,
 *   otherCount: number,
 *   numericIdRatio: number,
 *   anonymous184Ratio: number
 * }}
 */
export function summarizeIdentifierStats(comments) {
  const list = Array.isArray(comments) ? comments : [];
  let numeric = 0;
  let anon = 0;
  let self = 0;
  let other = 0;
  for (const c of list) {
    const uid = c?.userId == null ? '' : String(c.userId).trim();
    if (c?.selfPosted) self += 1;
    if (/^\d+$/.test(uid)) {
      numeric += 1;
    } else if (uid.startsWith('a:')) {
      anon += 1;
    } else {
      other += 1;
    }
  }
  const total = list.length;
  return {
    totalCount: total,
    numericIdCount: numeric,
    anonymous184Count: anon,
    selfPostedCount: self,
    otherCount: other,
    numericIdRatio: total > 0 ? Math.round((numeric / total) * 1000) / 1000 : 0,
    anonymous184Ratio: total > 0 ? Math.round((anon / total) * 1000) / 1000 : 0
  };
}
