/**
 * L0 Evidence（拡張の観測データ）→ L1 Canonical Snapshot 変換。
 *
 * 入力：v0.1.184 で導入した officialValuesV2 形式（{ value, source, ageMs, reason }
 * の組をフィールド毎に持つオブジェクト）。
 * 出力：CanonicalLiveSnapshot（schema.js）。
 *
 * 純粋関数。同じ入力なら必ず同じ出力（Deterministic）。
 */

import {
  CANONICAL_SNAPSHOT_VERSION,
  REASON_CODES,
  makeCanonicalValue
} from './schema.js';
import { buildMcpRankingSnippetFromBundle } from './buildMcpRankingSnippet.js';

/**
 * @typedef {import('./schema.js').CanonicalLiveSnapshot} CanonicalLiveSnapshot
 * @typedef {import('./schema.js').CanonicalValueWithMeta} CanonicalValueWithMeta
 */

/**
 * @typedef {{
 *   value: unknown,
 *   source: string,
 *   ageMs: number | null,
 *   reason: string | null
 * }} OfficialValueV2
 */

/**
 * 同じ意味の値を複数ソースから持つ場合（例：ndgr / domStats / domBanner）、
 * 優先順位リストで最初に「値あり」のものを採用する。
 *
 * @param {Record<string, OfficialValueV2>|null|undefined} sources
 * @param {string[]} priorities
 * @returns {CanonicalValueWithMeta|null}
 */
function pickBestSource(sources, priorities) {
  if (!sources || typeof sources !== 'object') return null;
  for (const key of priorities) {
    const v = /** @type {OfficialValueV2|undefined} */ (sources[key]);
    if (!v) continue;
    if (v.value !== null && v.value !== undefined && v.value !== '') {
      return makeCanonicalValue({
        value: v.value,
        source: v.source,
        ageMs: v.ageMs,
        reason: v.reason
      });
    }
  }
  // どれも値がなければ最初の priority を「no_field」で返す
  const fallback = /** @type {OfficialValueV2|undefined} */ (sources[priorities[0]]);
  if (fallback) {
    return makeCanonicalValue({
      value: null,
      source: fallback.source,
      ageMs: fallback.ageMs,
      reason: fallback.reason || REASON_CODES.NO_FIELD
    });
  }
  return null;
}

/**
 * Build 入力。officialValuesV2 は v0.1.184 の構造に準拠。
 *
 * @typedef {{
 *   extensionVersion?: string,
 *   buildId?: string,
 *   seq?: number,
 *   liveId?: string,
 *   watchUrl?: string,
 *   aligned?: boolean,
 *   exportedAt?: number,
 *   officialValuesV2?: {
 *     programGiftPoints?: Record<string, OfficialValueV2>,
 *     giftPoints?: Record<string, OfficialValueV2>,
 *     adPoints?: Record<string, OfficialValueV2>,
 *     eventGiftScore?: Record<string, OfficialValueV2>,
 *     nicoEventRank?: Record<string, OfficialValueV2>,
 *     nicoEventTitle?: Record<string, OfficialValueV2>
 *   },
 *   mismatchReasons?: string[],
 *   officialEventDomBundle?: unknown
 * }} BuildLiveMcpSnapshotInput
 */

/**
 * @param {BuildLiveMcpSnapshotInput} input
 * @returns {CanonicalLiveSnapshot}
 */
export function buildLiveMcpSnapshot(input = {}) {
  const v2 = input.officialValuesV2 || {};

  /** @type {CanonicalLiveSnapshot} */
  const snapshot = {
    nlsMcpSnapshotVersion: CANONICAL_SNAPSHOT_VERSION,
    meta: {
      extensionVersion: String(input.extensionVersion || ''),
      buildId: String(input.buildId || ''),
      exportedAt: typeof input.exportedAt === 'number' ? input.exportedAt : Date.now(),
      seq: Number(input.seq) || 0
    },
    watch: {
      liveId: String(input.liveId || ''),
      watchUrl: String(input.watchUrl || ''),
      aligned: input.aligned !== false
    },
    gift: {},
    diag: {
      mismatchReasons: Array.isArray(input.mismatchReasons)
        ? [...input.mismatchReasons]
        : []
    }
  };

  // officialValuesV2 → gift block 変換
  // 優先順位は固定（ndgr → domStats / domBanner）。
  // ここを変えると Deterministic Merge が壊れるので慎重に。
  /** @type {[keyof CanonicalLiveSnapshot['gift'], string, string[]][]} */
  const mappings = [
    ['programGiftPoints', 'giftPoints', ['ndgr', 'domStats']],
    ['adPoints', 'adPoints', ['ndgr', 'domStats']],
    ['eventGiftScore', 'eventGiftScore', ['ndgr', 'domBanner']],
    ['nicoEventRank', 'nicoEventRank', ['ndgr', 'domBanner']],
    ['nicoEventTitle', 'nicoEventTitle', ['ndgr', 'domBanner']]
  ];

  for (const [outKey, inKey, priorities] of mappings) {
    const sources = /** @type {Record<string, OfficialValueV2>|undefined} */ (
      /** @type {Record<string, unknown>} */ (v2)[inKey]
    );
    if (!sources) continue;
    const picked = pickBestSource(sources, priorities);
    if (picked) {
      snapshot.gift[outKey] = picked;
    }
  }

  const rankingSnippet = buildMcpRankingSnippetFromBundle(input.officialEventDomBundle);
  if (rankingSnippet) {
    /** @type {Record<string, unknown>} */ (snapshot.diag).rankingSnippet = rankingSnippet;
  }

  return snapshot;
}
