/**
 * chrome.storage.local に保存する診断エラーリング（純粋・マージのみ）。
 */

export const DIAGNOSTIC_RING_MAX = 80;
export const DIAGNOSTIC_RING_ENTRY_MAX_CHARS = 1000;

/**
 * @typedef {{
 *   at: number,
 *   context: string,
 *   phase?: string,
 *   message?: string,
 *   stackHead?: string,
 *   liveId?: string,
 *   sanitizedUrl?: string,
 *   generation?: number,
 *   storageKey?: string
 * }} DiagnosticRingEntry
 */

/**
 * @param {unknown} x
 * @returns {x is DiagnosticRingEntry}
 */
function isRingEntry(x) {
  if (!x || typeof x !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (x);
  return typeof o.at === 'number' && typeof o.context === 'string';
}

/**
 * @param {DiagnosticRingEntry} entry
 * @returns {DiagnosticRingEntry}
 */
export function trimRingEntryFields(entry) {
  /**
   * @param {unknown} s
   * @param {number} n
   */
  const safe = (s, n) => {
    const t = String(s ?? '');
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };
  return {
    at: Number(entry.at) || 0,
    context: safe(entry.context, 32),
    ...(entry.phase ? { phase: safe(entry.phase, 64) } : {}),
    ...(entry.message ? { message: safe(entry.message, DIAGNOSTIC_RING_ENTRY_MAX_CHARS) } : {}),
    ...(entry.stackHead ? { stackHead: safe(entry.stackHead, 400) } : {}),
    ...(entry.liveId ? { liveId: safe(entry.liveId, 32) } : {}),
    ...(entry.sanitizedUrl
      ? { sanitizedUrl: safe(entry.sanitizedUrl, 500) }
      : {}),
    ...(entry.generation != null && Number.isFinite(entry.generation)
      ? { generation: Math.floor(Number(entry.generation)) }
      : {}),
    ...(entry.storageKey ? { storageKey: safe(entry.storageKey, 120) } : {})
  };
}

/**
 * 古い順に捨てながら entry を追加する。
 * @param {unknown[]} current
 * @param {DiagnosticRingEntry} nextEntry
 * @returns {DiagnosticRingEntry[]}
 */
export function mergeDiagnosticRingAppend(current, nextEntry) {
  const cur = Array.isArray(current) ? current.filter(isRingEntry) : [];
  const e = trimRingEntryFields(nextEntry);
  const out = /** @type {DiagnosticRingEntry[]} */ ([...cur, e]);
  while (out.length > DIAGNOSTIC_RING_MAX) {
    out.shift();
  }
  return out;
}
