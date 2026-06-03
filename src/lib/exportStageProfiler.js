/**
 * HTML / マーケ DL の段階計測（体感調査用）。chrome 非依存の純関数。
 */

/**
 * @typedef {{ stage: string, ms: number }} ExportStageTimingRow
 */

/**
 * @returns {{
 *   mark: (stage: string) => void,
 *   finish: (label?: string) => { rows: ExportStageTimingRow[], summary: string },
 *   rows: () => ExportStageTimingRow[]
 * }}
 */
export function createExportStageProfiler() {
  const startedAt = Date.now();
  /** @type {number|null} */
  let lastAt = startedAt;
  /** @type {ExportStageTimingRow[]} */
  const rows = [];

  return {
    mark(stage) {
      const now = Date.now();
      const ms = Math.max(0, now - (lastAt ?? startedAt));
      rows.push({ stage: String(stage || 'stage'), ms });
      lastAt = now;
    },
    finish(label = 'export') {
      const total = Math.max(0, Date.now() - startedAt);
      const parts = rows.map((r) => `${r.stage} ${formatMsShort(r.ms)}`);
      const summary =
        parts.length > 0
          ? `${label} ${parts.join(' · ')}（計 ${formatMsShort(total)}）`
          : `${label}（計 ${formatMsShort(total)}）`;
      return { rows: [...rows], summary };
    },
    rows: () => [...rows]
  };
}

/**
 * DevTools: `globalThis.__nlsExportProfile = true` のとき console.table する。
 * @param {string} label
 * @param {ExportStageTimingRow[]} rows
 */
export function logExportStageProfileIfEnabled(label, rows) {
  try {
    if (
      typeof globalThis !== 'undefined' &&
      /** @type {{ __nlsExportProfile?: boolean }} */ (globalThis).__nlsExportProfile === true
    ) {
      console.table(rows.map((r) => ({ stage: r.stage, ms: r.ms })));
      console.log(`[nls export] ${label}`, rows);
    }
  } catch {
    /* no-op */
  }
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatMsShort(ms) {
  const n = Math.max(0, Math.round(Number(ms) || 0));
  if (n < 1000) return `${n}ms`;
  const s = Math.round((n / 1000) * 10) / 10;
  return `${s}s`;
}
