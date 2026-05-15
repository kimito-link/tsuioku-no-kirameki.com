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
 *
 * @typedef {{
 *   capturedAt?: number|string|null,
 *   viewers?: number|string|null,
 *   concurrent?: number|string|null,
 *   count?: number|string|null
 * }} ReportViewerSampleInput
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
 * @param {unknown} v
 * @returns {number|null}
 */
function toNonNegativeNumberOrNull(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** @param {number|null} value */
function formatNumber(value) {
  if (value == null) return '未取得';
  return Math.round(value).toLocaleString('ja-JP');
}

/** @param {number} ms */
function formatElapsed(ms) {
  const safeMs = Math.max(0, ms);
  const totalSec = Math.floor(safeMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * @param {unknown} value
 * @param {number} max
 */
function trimText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
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

/**
 * @param {ReportCommentInput[]} comments
 * @param {number|null} firstCapturedAt
 */
function summarizePeakCommentWindow(comments, firstCapturedAt) {
  if (firstCapturedAt == null) return null;
  /** @type {Map<number, { bucket: number, count: number, samples: string[] }>} */
  const buckets = new Map();
  for (const c of comments) {
    const at = toFiniteNumberOrNull(c?.capturedAt);
    if (at == null) continue;
    const bucket = Math.max(0, Math.floor((at - firstCapturedAt) / 60_000));
    const cur = buckets.get(bucket) || { bucket, count: 0, samples: [] };
    cur.count += 1;
    const sample = trimText(c?.text, 42);
    if (sample && cur.samples.length < 3) cur.samples.push(sample);
    buckets.set(bucket, cur);
  }
  let best = null;
  for (const row of buckets.values()) {
    if (!best || row.count > best.count) best = row;
  }
  if (!best) return null;
  return {
    startMs: best.bucket * 60_000,
    endMs: (best.bucket + 1) * 60_000,
    count: best.count,
    samples: best.samples
  };
}

/**
 * @param {ReportViewerSampleInput[]} samples
 */
function summarizeViewerMovement(samples) {
  const list = Array.isArray(samples) ? samples : [];
  const normalized = [];
  for (const sample of list) {
    const capturedAt = toFiniteNumberOrNull(sample?.capturedAt);
    const viewers =
      toNonNegativeNumberOrNull(sample?.viewers) ??
      toNonNegativeNumberOrNull(sample?.concurrent) ??
      toNonNegativeNumberOrNull(sample?.count);
    if (capturedAt == null || viewers == null) continue;
    normalized.push({ capturedAt, viewers });
  }
  normalized.sort((a, b) => a.capturedAt - b.capturedAt);
  if (normalized.length < 2) return null;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const peak = normalized.reduce((best, row) => (row.viewers > best.viewers ? row : best), first);
  const low = normalized.reduce((best, row) => (row.viewers < best.viewers ? row : best), first);
  return {
    startViewers: first.viewers,
    endViewers: last.viewers,
    delta: last.viewers - first.viewers,
    peakViewers: peak.viewers,
    peakCapturedAt: peak.capturedAt,
    lowViewers: low.viewers
  };
}

/**
 * コメント・同接サンプル・公式値から、HTML レポートや AI prompt に渡せる
 * 放送振り返りの短いナラティブを組み立てる。
 *
 * @param {{
 *   snapshot?: {
 *     broadcasterLevel?: number|null,
 *     watchCount?: number|string|null,
 *     commentCount?: number|string|null,
 *     giftPoints?: number|string|null,
 *     peakConcurrent?: number|string|null
 *   } | null,
 *   comments?: ReportCommentInput[],
 *   viewerSamples?: ReportViewerSampleInput[],
 *   broadcastTitle?: string,
 *   title?: string,
 *   broadcasterName?: string
 * }} input
 * @returns {{
 *   heading: string,
 *   lines: string[],
 *   promptContext: string,
 *   metrics: {
 *     timing: ReturnType<typeof summarizeBroadcastTiming>,
 *     body: ReturnType<typeof summarizeCommentBodyStats>,
 *     identifiers: ReturnType<typeof summarizeIdentifierStats>,
 *     peakCommentWindow: ReturnType<typeof summarizePeakCommentWindow>,
 *     viewerMovement: ReturnType<typeof summarizeViewerMovement>
 *   }
 * }}
 */
export function buildBroadcastReportNarrative(input = {}) {
  const snapshot = input?.snapshot ?? null;
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  const title = trimText(input?.broadcastTitle || input?.title || 'この放送', 60);
  const broadcaster = trimText(input?.broadcasterName || '', 40);
  const timing = summarizeBroadcastTiming({ snapshot, comments });
  const body = summarizeCommentBodyStats(comments);
  const identifiers = summarizeIdentifierStats(comments);
  const peakCommentWindow = summarizePeakCommentWindow(comments, timing.firstCapturedAt);
  const viewerMovement = summarizeViewerMovement(input?.viewerSamples || []);
  const officialComments =
    snapshot && typeof snapshot === 'object'
      ? toNonNegativeNumberOrNull(snapshot.commentCount)
      : null;
  const watchCount =
    snapshot && typeof snapshot === 'object'
      ? toNonNegativeNumberOrNull(snapshot.watchCount)
      : null;
  const giftPoints =
    snapshot && typeof snapshot === 'object'
      ? toNonNegativeNumberOrNull(snapshot.giftPoints)
      : null;
  const peakConcurrent =
    snapshot && typeof snapshot === 'object'
      ? toNonNegativeNumberOrNull(snapshot.peakConcurrent)
      : null;

  /** @type {string[]} */
  const lines = [];
  const owner = broadcaster ? `${broadcaster}さんの` : '';
  if (body.totalCount === 0) {
    lines.push(`${owner}「${title}」は、コメント記録がまだ少ないため次回以降の比較材料をためる段階です。`);
  } else {
    const duration =
      timing.durationMinutes > 0
        ? `${Math.round(timing.durationMinutes * 10) / 10}分`
        : '短時間';
    lines.push(
      `${owner}「${title}」は、記録コメント ${formatNumber(body.totalCount)} 件を ${duration} で振り返れる配信です。平均 ${timing.commentsPerMinute.toLocaleString('ja-JP')} 件/分の流れでした。`
    );
  }
  if (peakCommentWindow) {
    const samples = peakCommentWindow.samples.length
      ? ` 代表コメント: ${peakCommentWindow.samples.join(' / ')}`
      : '';
    lines.push(
      `コメントの山は ${formatElapsed(peakCommentWindow.startMs)}-${formatElapsed(peakCommentWindow.endMs)} に ${formatNumber(peakCommentWindow.count)} 件。${samples}`
    );
  }
  if (watchCount != null || peakConcurrent != null || viewerMovement) {
    const official = [];
    if (watchCount != null) official.push(`来場 ${formatNumber(watchCount)} 人`);
    if (peakConcurrent != null) official.push(`ピーク同接 ${formatNumber(peakConcurrent)} 人`);
    if (viewerMovement) {
      const sign = viewerMovement.delta >= 0 ? '+' : '';
      official.push(`同接推移 ${formatNumber(viewerMovement.startViewers)}→${formatNumber(viewerMovement.endViewers)} 人（${sign}${formatNumber(viewerMovement.delta)}）`);
    }
    lines.push(`視聴者の動きは ${official.join(' / ')}。`);
  }
  if (body.totalCount > 0) {
    const anonPct = Math.round(identifiers.anonymous184Ratio * 100);
    lines.push(
      `コメント本文は平均 ${body.averageChars.toLocaleString('ja-JP')} 字、中央値 ${body.medianChars.toLocaleString('ja-JP')} 字。184 コメント比率は ${anonPct}% です。`
    );
  }
  if (giftPoints != null) {
    lines.push(`ギフトは番組累計 ${formatNumber(giftPoints)} pt。コメントの山と重ねると、応援が動いた瞬間を確認しやすくなります。`);
  }
  if (officialComments != null && body.totalCount > 0) {
    lines.push(`公式コメント数 ${formatNumber(officialComments)} 件に対し、ローカル記録は ${formatNumber(body.totalCount)} 件です。`);
  }

  const heading = broadcaster ? `${broadcaster}さんの配信振り返り` : '配信振り返り';
  return {
    heading,
    lines,
    promptContext: lines.join('\n'),
    metrics: {
      timing,
      body,
      identifiers,
      peakCommentWindow,
      viewerMovement
    }
  };
}
