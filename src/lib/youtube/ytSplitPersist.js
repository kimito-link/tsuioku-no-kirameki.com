/**
 * 声の割り当てと配信のまとめを、人数や配信の数に比例して大きくなる1個の値で書き直さない。
 * chrome.storage の1回の書き込みは、変わった1人・1配信だけで、64KB を超えない。
 * 記録そのものは IndexedDB の版付きの行に残す。ここは大きさの計算だけ(ブラウザ API は呼ばない)。
 */

export const YT_STORAGE_WRITE_MAX_BYTES = 64 * 1024;
export const YT_SUMMARY_CHROME_PREFIX = 'ytm:sum:v1:';
export const YT_SUMMARY_CHROME_MIN_GAP_MS = 1000;
export const YT_SPLIT_RECORD_VERSION = 1;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function storageJsonBytes(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string') return Number.POSITIVE_INFINITY;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
    return json.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * @param {unknown} videoId
 * @returns {string}
 */
export function summaryStorageKey(videoId) {
  const id = String(videoId || '').trim();
  if (!id || id.length > 200) return '';
  return YT_SUMMARY_CHROME_PREFIX + encodeURIComponent(id);
}

/**
 * @param {string} key
 * @returns {string}
 */
export function videoIdFromSummaryStorageKey(key) {
  const k = String(key || '');
  // 本体に同梱した画面は、鍵の先頭 ytm: を外してから変化を渡す。どちらでも同じ配信に戻す。
  const prefixes = [YT_SUMMARY_CHROME_PREFIX, YT_SUMMARY_CHROME_PREFIX.slice('ytm:'.length)];
  for (const prefix of prefixes) {
    if (!prefix || !k.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(k.slice(prefix.length));
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * @param {unknown} text
 * @param {number} max
 * @returns {string}
 */
function clip(text, max) {
  const s = String(text || '');
  if (s.startsWith('data:')) return '';
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * chrome.storage に置く1配信分。本文のコメント配列は含めない。
 * 長すぎる1項目は捨てる(その1件だけ)。正本は IndexedDB 側。
 * @param {any} summary
 * @returns {Record<string, unknown> | null}
 */
export function slimSummaryForStorage(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const videoId = String(summary.videoId || '').trim();
  if (!videoId) return null;
  const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  /** @type {Record<string, unknown>} */
  const slim = {
    v: YT_SPLIT_RECORD_VERSION,
    videoId,
    title: clip(summary.title, 180),
    broadcasterName: clip(summary.broadcasterName, 80),
    broadcasterChannelId: clip(summary.broadcasterChannelId, 80),
    broadcasterHandle: clip(summary.broadcasterHandle, 80),
    broadcasterIconUrl: clip(summary.broadcasterIconUrl, 500),
    concurrentViewers: num(summary.concurrentViewers),
    peakConcurrentViewers: num(summary.peakConcurrentViewers),
    chatFilterLabel: clip(summary.chatFilterLabel, 40),
    itemCount: typeof summary.itemCount === 'number' && summary.itemCount >= 0 ? Math.floor(summary.itemCount) : 0,
    startedAt: num(summary.startedAt),
    startedAtApprox: summary.startedAtApprox === true,
    endedAt: num(summary.endedAt),
    createdAt: num(summary.createdAt),
    updatedAt: num(summary.updatedAt),
  };
  // 0.1.2082: master の #623・#627 で増えた項目(同接を読んだ時刻・枠の視聴数とコメント数・サービス特有の公式の数字)。
  //   落とすと画面の正本(knownSummaries)から消え、ABEMA の視聴数や公式ランキングの数字が出なくなる。
  const vra = num(summary.viewersReadAt);
  if (vra != null) slim.viewersReadAt = vra;
  if (summary.viewersStale === true) slim.viewersStale = true;
  const src = clip(summary.sourceUrl, 500);
  if (src) slim.sourceUrl = src;
  const svc = num(summary.slotViewCount);
  if (svc != null) slim.slotViewCount = svc;
  const scc = num(summary.slotCommentCount);
  if (scc != null) slim.slotCommentCount = scc;
  if (summary.platformStats && typeof summary.platformStats === 'object') slim.platformStats = summary.platformStats;
  if (storageJsonBytes(slim) > YT_STORAGE_WRITE_MAX_BYTES) return null;
  return slim;
}

/**
 * 件数の知らせを chrome.storage に書いてよいか。1配信あたり最短1秒。
 * @param {number} lastAt
 * @param {number} now
 * @param {number} [minGapMs]
 * @returns {boolean}
 */
export function summaryChromeWriteDue(lastAt, now, minGapMs = YT_SUMMARY_CHROME_MIN_GAP_MS) {
  const last = Number(lastAt) || 0;
  const t = Number(now) || 0;
  return t - last >= minGapMs;
}

/**
 * @param {unknown} body
 * @returns {string}
 */
function stableBody(body) {
  try {
    return JSON.stringify(body) || '';
  } catch {
    return '';
  }
}

/**
 * 変わった人だけ。1人の値が 64KB を超えるものは、その1人だけ捨てる。
 * @param {Record<string, unknown> | null | undefined} prev
 * @param {Record<string, unknown> | null | undefined} next
 * @returns {{ userKey: string, body: unknown }[]}
 */
export function changedVoicePersonWrites(prev, next) {
  const before = prev && typeof prev === 'object' ? prev : {};
  const after = next && typeof next === 'object' ? next : {};
  /** @type {{ userKey: string, body: unknown }[]} */
  const out = [];
  for (const userKey of Object.keys(after)) {
    if (!userKey || userKey.length > 180) continue;
    if (stableBody(before[userKey]) === stableBody(after[userKey])) continue;
    const body = after[userKey];
    const rec = { v: YT_SPLIT_RECORD_VERSION, userKey, body };
    if (storageJsonBytes(rec) > YT_STORAGE_WRITE_MAX_BYTES) continue;
    out.push({ userKey, body });
  }
  return out;
}

/**
 * 読み戻した件数が、移した件数以上のときだけ古い鍵を消してよい。
 * @param {{ stored: number, readBack: number }} n
 * @returns {boolean}
 */
export function verifiedBeforeRetire(n) {
  const stored = Number(n?.stored);
  const readBack = Number(n?.readBack);
  if (!Number.isFinite(stored) || !Number.isFinite(readBack)) return false;
  if (stored < 0 || readBack < 0) return false;
  return readBack >= stored;
}

/**
 * 同じ組み立てのやり直しでは、新しく作る行は 0。増分は足した行数以下。
 * @param {{ made: number, added: number }} n
 * @returns {boolean}
 */
export function rowsMadeWithinAdded(n) {
  const made = Number(n?.made);
  const added = Number(n?.added);
  if (!Number.isFinite(made) || !Number.isFinite(added)) return false;
  if (added === 0) return made === 0;
  return made >= 0 && made <= added;
}

/**
 * 11/09 の書き方と、いまの書き方を同じ負荷で比べるための入力。
 * 配信4時間・それ以外の時間はこれらの鍵を書かない。大きさは PC 実測。
 * voiceBytes: 声の割り当て全体 1,789,993 バイト(21,897人)。
 * summaryBytes: 配信のまとめ全体 約70KB。
 * commentBytes: 2026-11-09 の実測(1回 約5.5MB・90秒に39回)。
 * largestCommentBytes: いま残っている最大の鍵 24.6MB を、同じ回数で書いた場合。
 */
export const STORAGE_CHURN_WORKLOAD = Object.freeze({
  streamMs: 4 * 60 * 60 * 1000,
  voiceBytes: 1789993,
  voiceEveryMs: 30000,
  voiceBrokenEveryMs: 240000 / 46,
  summaryBytes: 70000,
  flushEveryMs: 400,
  summaryMinGapMs: YT_SUMMARY_CHROME_MIN_GAP_MS,
  commentBytes: 5500000,
  commentEveryMs: 90000 / 39,
  largestCommentBytes: 24600000,
});

/**
 * @param {typeof STORAGE_CHURN_WORKLOAD} workload
 * @param {'before' | 'before-broken-gate' | 'after'} policy
 * @param {{ slimSummaryBytes?: number }} [opt]
 * @returns {{ voice: number, summary: number, comments: number, commentsAtLargestKey: number, total: number, totalAtLargestKey: number, voiceWrites: number, summaryWrites: number, commentWrites: number }}
 */
export function estimateChromeStorageBytes(workload, policy, opt = {}) {
  const streamMs = Number(workload?.streamMs) || 0;
  const voiceEvery = policy === 'before-broken-gate'
    ? Number(workload.voiceBrokenEveryMs) || 1
    : Number(workload.voiceEveryMs) || 1;
  const flushEvery = Number(workload.flushEveryMs) || 1;
  const commentEvery = Number(workload.commentEveryMs) || 1;
  const voiceWrites = policy === 'after' ? 0 : Math.floor(streamMs / voiceEvery);
  const commentWrites = policy === 'after' ? 0 : Math.floor(streamMs / commentEvery);
  let summaryWrites = 0;
  if (policy === 'after') {
    const gap = Number(workload.summaryMinGapMs) || YT_SUMMARY_CHROME_MIN_GAP_MS;
    let last = -gap;
    for (let t = 0; t <= streamMs; t += flushEvery) {
      if (summaryChromeWriteDue(last, t, gap)) {
        summaryWrites += 1;
        last = t;
      }
    }
  } else {
    summaryWrites = Math.floor(streamMs / flushEvery) + 1;
  }
  const voice = voiceWrites * (Number(workload.voiceBytes) || 0);
  const summary = summaryWrites * (policy === 'after'
    ? (Number(opt.slimSummaryBytes) || 0)
    : (Number(workload.summaryBytes) || 0));
  const comments = commentWrites * (Number(workload.commentBytes) || 0);
  const commentsAtLargestKey = commentWrites * (Number(workload.largestCommentBytes) || 0);
  return {
    voice,
    summary,
    comments,
    commentsAtLargestKey,
    total: voice + summary + comments,
    totalAtLargestKey: voice + summary + commentsAtLargestKey,
    voiceWrites,
    summaryWrites,
    commentWrites,
  };
}
