/**
 * コメント取り込みの監査ログ（しおりのようにストレージへイベントが積まれる）。
 * PII なし: 件数・経路・liveId・任意で公式件数のみ。
 */

export const COMMENT_INGEST_LOG_VERSION = 1;
export const COMMENT_INGEST_LOG_MAX_ITEMS = 500;

/** @enum {string} */
export const COMMENT_INGEST_SOURCE = {
  NDGR: 'ndgr',
  VISIBLE: 'visible',
  MUTATION: 'mutation',
  DEEP: 'deep',
  UNKNOWN: 'unknown'
};

const INGEST_LOG_VALID_SOURCES = /** @type {ReadonlySet<string>} */ (
  new Set(Object.values(COMMENT_INGEST_SOURCE))
);
export const COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS = 5000;
export const COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS = 4000;
export const COMMENT_INGEST_LOG_NDGR_MIN_ADDED = 3;
export const COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED = 5;
const INGEST_LOG_ALWAYS_LOG_TOTAL_DELTA = 10;

const INGEST_LOG_COOLDOWN_RULES = /** @type {Readonly<Record<string, { minIntervalMs: number, minAdded: number, minTotalDelta: number }>>} */ ({
  [COMMENT_INGEST_SOURCE.NDGR]: {
    minIntervalMs: COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS,
    minAdded: COMMENT_INGEST_LOG_NDGR_MIN_ADDED,
    minTotalDelta: INGEST_LOG_ALWAYS_LOG_TOTAL_DELTA
  },
  [COMMENT_INGEST_SOURCE.VISIBLE]: {
    minIntervalMs: COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS,
    minAdded: COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED,
    minTotalDelta: INGEST_LOG_ALWAYS_LOG_TOTAL_DELTA
  }
});

/**
 * @param {unknown} src
 * @returns {string}
 */
function normalizeIngestSource(src) {
  const s = String(src || '').trim().toLowerCase().slice(0, 32);
  return INGEST_LOG_VALID_SOURCES.has(s) ? s : COMMENT_INGEST_SOURCE.UNKNOWN;
}

/**
 * @typedef {{
 *   t: number,
 *   liveId: string,
 *   source: string,
 *   batchIn: number,
 *   added: number,
 *   totalAfter: number,
 *   official: number|null
 * }} CommentIngestLogItem
 */

/**
 * @param {unknown} raw
 * @returns {{ v: number, items: CommentIngestLogItem[] }}
 */
export function parseCommentIngestLog(raw) {
  if (!raw || typeof raw !== 'object') {
    return { v: COMMENT_INGEST_LOG_VERSION, items: [] };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  const v = Number(o.v) || COMMENT_INGEST_LOG_VERSION;
  const items = Array.isArray(o.items) ? o.items : [];
  /** @type {CommentIngestLogItem[]} */
  const out = [];
  for (const x of items) {
    if (!x || typeof x !== 'object') continue;
    const it = /** @type {Record<string, unknown>} */ (x);
    const t = Number(it.t);
    if (!Number.isFinite(t)) continue;
    const liveId = String(it.liveId || '').trim().toLowerCase();
    if (!liveId) continue;
    const source = normalizeIngestSource(it.source);
    const batchIn = Math.max(0, Math.floor(Number(it.batchIn) || 0));
    const added = Math.max(0, Math.floor(Number(it.added) || 0));
    const totalAfter = Math.max(0, Math.floor(Number(it.totalAfter) || 0));
    let official = null;
    if (it.official != null && Number.isFinite(Number(it.official))) {
      const oc = Math.floor(Number(it.official));
      official = oc >= 0 ? oc : null;
    }
    out.push({ t, liveId, source, batchIn, added, totalAfter, official });
  }
  return { v, items: out };
}

/**
 * @param {unknown} prevRaw
 * @param {Omit<CommentIngestLogItem, 'official'> & { official?: number|null }} entry
 * @param {number} [maxItems]
 * @returns {{ v: number, items: CommentIngestLogItem[] }}
 */
export function appendCommentIngestLog(prevRaw, entry, maxItems = COMMENT_INGEST_LOG_MAX_ITEMS) {
  const base = parseCommentIngestLog(prevRaw);
  const cap = Math.max(16, Math.min(5000, Math.floor(maxItems)));
  const official =
    entry.official != null && Number.isFinite(Number(entry.official))
      ? Math.max(0, Math.floor(Number(entry.official)))
      : null;
  /** @type {CommentIngestLogItem} */
  const row = {
    t: Math.max(0, Math.floor(Number(entry.t) || Date.now())),
    liveId: String(entry.liveId || '').trim().toLowerCase(),
    source: normalizeIngestSource(entry.source),
    batchIn: Math.max(0, Math.floor(Number(entry.batchIn) || 0)),
    added: Math.max(0, Math.floor(Number(entry.added) || 0)),
    totalAfter: Math.max(0, Math.floor(Number(entry.totalAfter) || 0)),
    official
  };
  const nextItems = [...base.items, row].slice(-cap);
  return { v: COMMENT_INGEST_LOG_VERSION, items: nextItems };
}

/**
 * 高頻度 source（ndgr / visible）の「1件追加」を間引き、null ならストレージを更新しない。
 *
 * @param {unknown} prevRaw
 * @param {Omit<CommentIngestLogItem, 'official'> & { official?: number|null }} entry
 * @param {number} [maxItems]
 * @returns {{ v: number, items: CommentIngestLogItem[] }|null}
 */
export function maybeAppendCommentIngestLog(prevRaw, entry, maxItems = COMMENT_INGEST_LOG_MAX_ITEMS) {
  const base = parseCommentIngestLog(prevRaw);
  const lid = String(entry.liveId || '').trim().toLowerCase();
  const src = normalizeIngestSource(entry.source);
  const t = Math.max(0, Math.floor(Number(entry.t) || Date.now()));
  const added = Math.max(0, Math.floor(Number(entry.added) || 0));
  const totalAfter = Math.max(0, Math.floor(Number(entry.totalAfter) || 0));

  const cooldownRule = INGEST_LOG_COOLDOWN_RULES[src];
  if (!cooldownRule) {
    return appendCommentIngestLog(prevRaw, entry, maxItems);
  }

  /** @type {CommentIngestLogItem|null} */
  let prevSame = null;
  for (let i = base.items.length - 1; i >= 0; i--) {
    const it = base.items[i];
    if (it.liveId === lid && it.source === src) {
      prevSame = it;
      break;
    }
  }

  if (prevSame) {
    const dt = t - prevSame.t;
    const totalDelta = totalAfter - prevSame.totalAfter;
    if (
      dt >= 0 &&
      dt < cooldownRule.minIntervalMs &&
      added < cooldownRule.minAdded &&
      totalDelta >= 0 &&
      totalDelta < cooldownRule.minTotalDelta
    ) {
      return null;
    }
  }

  return appendCommentIngestLog(prevRaw, entry, maxItems);
}
