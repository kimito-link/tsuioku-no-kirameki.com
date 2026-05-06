/**
 * Canonical Snapshot の構造検証。schema.js の isCanonicalLiveSnapshot より詳細な
 * errors[] を返す。MCP server / Bridge writer 側でデータ受け入れ前のチェックに使う。
 */

import {
  CANONICAL_SNAPSHOT_VERSION,
  isCanonicalValueWithMeta
} from './schema.js';

/**
 * @typedef {import('./schema.js').CanonicalLiveSnapshot} CanonicalLiveSnapshot
 */

/**
 * @typedef {{ valid: boolean, errors: string[] }} ValidationResult
 */

/**
 * @param {unknown} snapshot
 * @returns {ValidationResult}
 */
export function validateLiveMcpSnapshot(snapshot) {
  /** @type {string[]} */
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object') {
    errors.push('snapshot is not an object');
    return { valid: false, errors };
  }
  const o = /** @type {Record<string, unknown>} */ (snapshot);

  if (o.nlsMcpSnapshotVersion !== CANONICAL_SNAPSHOT_VERSION) {
    errors.push(
      `version mismatch: expected ${CANONICAL_SNAPSHOT_VERSION}, got ${String(
        o.nlsMcpSnapshotVersion
      )}`
    );
  }

  // meta
  if (!o.meta || typeof o.meta !== 'object') {
    errors.push('meta is missing or not object');
  } else {
    const m = /** @type {Record<string, unknown>} */ (o.meta);
    if (typeof m.extensionVersion !== 'string') errors.push('meta.extensionVersion not string');
    if (typeof m.buildId !== 'string') errors.push('meta.buildId not string');
    if (typeof m.exportedAt !== 'number') errors.push('meta.exportedAt not number');
    if (typeof m.seq !== 'number') errors.push('meta.seq not number');
    if (typeof m.seq === 'number' && m.seq < 0) errors.push('meta.seq must be >= 0');
  }

  // watch
  if (!o.watch || typeof o.watch !== 'object') {
    errors.push('watch is missing or not object');
  } else {
    const w = /** @type {Record<string, unknown>} */ (o.watch);
    if (typeof w.liveId !== 'string') errors.push('watch.liveId not string');
    if (typeof w.watchUrl !== 'string') errors.push('watch.watchUrl not string');
    if (typeof w.aligned !== 'boolean') errors.push('watch.aligned not boolean');
  }

  // gift
  if (!o.gift || typeof o.gift !== 'object') {
    errors.push('gift is missing or not object');
  } else {
    const g = /** @type {Record<string, unknown>} */ (o.gift);
    for (const [k, v] of Object.entries(g)) {
      if (!isCanonicalValueWithMeta(v)) {
        errors.push(`gift.${k} is not a CanonicalValueWithMeta`);
      }
    }
  }

  // diag
  if (!o.diag || typeof o.diag !== 'object') {
    errors.push('diag is missing or not object');
  } else {
    const d = /** @type {Record<string, unknown>} */ (o.diag);
    if (!Array.isArray(d.mismatchReasons)) {
      errors.push('diag.mismatchReasons not array');
    } else {
      for (let i = 0; i < d.mismatchReasons.length; i++) {
        if (typeof d.mismatchReasons[i] !== 'string') {
          errors.push(`diag.mismatchReasons[${i}] not string`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
