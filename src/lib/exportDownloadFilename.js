/**
 * HTML / マーケ分析のダウンロードファイル名（配信開始日 + liveId）。
 * chrome.downloads の filename に渡す。パス区切り・禁止文字は除去する。
 */

const JST_TIME_ZONE = 'Asia/Tokyo';

/**
 * @param {unknown} value epoch ms
 * @returns {string} `YYYY-MM-DD`（JST）または `unknown-date`
 */
export function formatBroadcastDateYmdJst(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'unknown-date';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: JST_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(n));
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return 'unknown-date';
}

/**
 * @param {string} liveId
 * @returns {string}
 */
export function sanitizeLiveIdForFilename(liveId) {
  const raw = String(liveId || 'unknown').trim().toLowerCase();
  const safe = raw.replace(/[/\\:*?"<>|]/g, '').replace(/\.\./g, '').slice(0, 32);
  if (/^lv\d{1,15}$/.test(safe)) return safe;
  if (safe) return safe;
  return 'unknown';
}

/**
 * @param {{ capturedAt?: unknown }} c
 * @returns {number|null}
 */
function commentCapturedAtMs(c) {
  const at = Number(c?.capturedAt);
  return Number.isFinite(at) && at > 0 ? at : null;
}

/**
 * 配信開始の目安（記録コメントの最古 capturedAt を正本）。
 * @param {{
 *   comments?: Array<{ capturedAt?: unknown }>|null,
 *   snapshot?: { startAtMs?: unknown, programStartAtMs?: unknown }|null,
 *   nowMs?: number
 * }} input
 * @returns {number}
 */
export function resolveBroadcastStartMs(input = {}) {
  const comments = Array.isArray(input.comments) ? input.comments : [];
  /** @type {number|null} */
  let first = null;
  for (const c of comments) {
    const at = commentCapturedAtMs(c);
    if (at == null) continue;
    if (first == null || at < first) first = at;
  }
  if (first != null) return first;

  const snap = input.snapshot;
  if (snap && typeof snap === 'object') {
    for (const key of ['startAtMs', 'programStartAtMs']) {
      const v = Number(/** @type {Record<string, unknown>} */ (snap)[key]);
      if (Number.isFinite(v) && v > 0) return v;
    }
  }

  const now = Number(input.nowMs);
  return Number.isFinite(now) && now > 0 ? now : Date.now();
}

/**
 * @param {string} liveId
 * @param {{
 *   comments?: Array<{ capturedAt?: unknown }>|null,
 *   snapshot?: { startAtMs?: unknown, programStartAtMs?: unknown }|null,
 *   nowMs?: number
 * }} [opts]
 * @returns {string} 例: `2026-06-02_lv350663807.html`
 */
export function buildHtmlReportDownloadFilename(liveId, opts = {}) {
  const lv = sanitizeLiveIdForFilename(liveId);
  const date = formatBroadcastDateYmdJst(resolveBroadcastStartMs(opts));
  return `${date}_${lv}.html`;
}

/**
 * @param {string} liveId
 * @param {{
 *   comments?: Array<{ capturedAt?: unknown }>|null,
 *   snapshot?: { startAtMs?: unknown, programStartAtMs?: unknown }|null,
 *   nowMs?: number
 * }} [opts]
 * @returns {string} 例: `2026-06-02_lv350663807_marketing.html`
 */
export function buildMarketingReportDownloadFilename(liveId, opts = {}) {
  const lv = sanitizeLiveIdForFilename(liveId);
  const date = formatBroadcastDateYmdJst(resolveBroadcastStartMs(opts));
  return `${date}_${lv}_marketing.html`;
}
