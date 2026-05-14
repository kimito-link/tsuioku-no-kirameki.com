/**
 * MCP L1 snapshot の `diag.mismatchReasons` を組み立てる純関数。
 * 取得経路の整合・DOM bundle の鮮度など、PII を含まない理由コードのみ。
 */

/** 公式イベント DOM bundle の `capturedAt` がこの ms より古いと `dom_bundle_stale` */
export const MCP_DOM_BUNDLE_STALE_MS_DEFAULT = 90_000;

/**
 * @param {{
 *   liveIdAlignedWithUrl?: boolean|null|undefined,
 *   officialEventDomBundle?: { capturedAt?: number } | null,
 *   nowMs?: number,
 *   staleMs?: number
 * }} [input]
 * @returns {string[]}
 */
export function buildMcpMismatchReasons(input = {}) {
  const nowMs =
    typeof input.nowMs === 'number' && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const staleMs =
    typeof input.staleMs === 'number' && Number.isFinite(input.staleMs) && input.staleMs > 0
      ? input.staleMs
      : MCP_DOM_BUNDLE_STALE_MS_DEFAULT;

  /** @type {string[]} */
  const out = [];

  // 従来: `liveIdAlignedWithUrl ? [] : ['live_mismatch']`（true 以外はすべて mismatch）
  if (input.liveIdAlignedWithUrl !== true) {
    out.push('live_mismatch');
  }

  const bundle = input.officialEventDomBundle;
  if (bundle && typeof bundle === 'object') {
    const capturedAt = /** @type {Record<string, unknown>} */ (bundle).capturedAt;
    if (
      typeof capturedAt === 'number' &&
      Number.isFinite(capturedAt) &&
      capturedAt > 0 &&
      nowMs - capturedAt > staleMs
    ) {
      out.push('dom_bundle_stale');
    }
  }

  return out;
}
