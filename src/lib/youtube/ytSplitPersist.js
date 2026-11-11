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
