/**
 * L1 Canonical Snapshot の schema 定義（MCP Bridge から AI に返す正準形）。
 *
 * 設計原則（codex データ品質提案 + ロミ流）:
 * - 値ごとに source / ageMs / reason / confidence を持たせる（v0.1.184 の
 *   officialValuesV2 と同形式）
 * - liveId スコープ厳守。mismatchReasons を diag に出す
 * - meta.seq で Monotonic Sequence（古い世代の上書きを拒否）
 * - 副作用ゼロの純粋関数のみ（lib 全体）
 *
 * このファイルは型定義 + 定数 + ガードのみ。build/validate/merge は別ファイル。
 */

/** @type {1} */
export const CANONICAL_SNAPSHOT_VERSION = 1;

/**
 * 未取得理由コード。L2 Read Model や MCP の `reason` field に入る。
 *
 * - `no_field`: そもそも取得元に値がない
 * - `not_participating`: イベント不参加（eventGiftScore など）
 * - `stale`: 値はあるが古い（ageMs > threshold）
 * - `live_mismatch`: 別 live の応答（v0.1.178 で導入済の整合ガード由来）
 * - `uid_avatar_mismatch`: avatar URL と uid が不整合（avatar 紐付けガード由来）
 */
export const REASON_CODES = Object.freeze({
  NO_FIELD: 'no_field',
  NOT_PARTICIPATING: 'not_participating',
  STALE: 'stale',
  LIVE_MISMATCH: 'live_mismatch',
  UID_AVATAR_MISMATCH: 'uid_avatar_mismatch'
});

/**
 * 値の取得元（source）コード。観測経路を一意に識別する。
 */
export const VALUE_SOURCES = Object.freeze({
  NDGR_STATS: 'ndgr_stats',
  NDGR_GIFT_EVENT: 'ndgr_gift_event',
  NDGR_CHAT: 'ndgr_chat',
  DOM_PROGRAM_STATS: 'dom_program_stats',
  DOM_EVENT_BANNER: 'dom_event_banner',
  DOM_EVENT_BALLOON: 'dom_event_balloon',
  DOM_GIFT_HISTORY: 'dom_gift_history',
  DOM_CONTRIBUTION_RANKING: 'dom_contribution_ranking',
  DOM_COMMENT_GIFT: 'dom_comment_gift',
  NICOAD_PUBLISH: 'nicoad_publish'
});

/**
 * 値の信頼度（confidence）の典型値。0-1 の連続値だが、運用では離散的に使う。
 */
export const CONFIDENCE_LEVELS = Object.freeze({
  AUTHORITATIVE: 1.0, // 公式 NDGR / 番組統計
  HIGH: 0.9, // DOM 由来（公式 UI から直接 scrape）
  MEDIUM: 0.6, // コメント文字列パース（NDGR/DOM）
  LOW: 0.3, // 推定値・補完値
  STALE: 0.1 // 古い値
});

/**
 * @typedef {{
 *   value: unknown,
 *   source: string,
 *   ageMs: number | null,
 *   reason: string | null,
 *   confidence?: number
 * }} CanonicalValueWithMeta
 */

/**
 * @param {unknown} v
 * @returns {v is CanonicalValueWithMeta}
 */
export function isCanonicalValueWithMeta(v) {
  if (!v || typeof v !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (v);
  if (!Object.prototype.hasOwnProperty.call(o, 'value')) return false;
  if (typeof o.source !== 'string') return false;
  if (o.ageMs !== null && typeof o.ageMs !== 'number') return false;
  if (o.reason !== null && typeof o.reason !== 'string') return false;
  if (o.confidence !== undefined && typeof o.confidence !== 'number') return false;
  return true;
}

/**
 * @typedef {{
 *   nlsMcpSnapshotVersion: 1,
 *   meta: {
 *     extensionVersion: string,
 *     buildId: string,
 *     exportedAt: number,
 *     seq: number
 *   },
 *   watch: {
 *     liveId: string,
 *     watchUrl: string,
 *     aligned: boolean
 *   },
 *   gift: {
 *     programGiftPoints?: CanonicalValueWithMeta,
 *     adPoints?: CanonicalValueWithMeta,
 *     eventGiftScore?: CanonicalValueWithMeta,
 *     nicoEventRank?: CanonicalValueWithMeta,
 *     nicoEventTitle?: CanonicalValueWithMeta
 *   },
 *   diag: {
 *     mismatchReasons: string[],
 *     rankingSnippet?: object
 *   }
 * }} CanonicalLiveSnapshot
 */

/**
 * @param {unknown} v
 * @returns {v is CanonicalLiveSnapshot}
 */
export function isCanonicalLiveSnapshot(v) {
  if (!v || typeof v !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (v);
  if (o.nlsMcpSnapshotVersion !== CANONICAL_SNAPSHOT_VERSION) return false;
  if (!o.meta || typeof o.meta !== 'object') return false;
  if (!o.watch || typeof o.watch !== 'object') return false;
  if (!o.gift || typeof o.gift !== 'object') return false;
  if (!o.diag || typeof o.diag !== 'object') return false;
  const d = /** @type {Record<string, unknown>} */ (o.diag);
  if (!Array.isArray(d.mismatchReasons)) return false;
  return true;
}

/**
 * 初期 snapshot を生成する。Producer が値を埋める前のテンプレート。
 *
 * @param {{
 *   extensionVersion?: string,
 *   buildId?: string,
 *   seq?: number,
 *   liveId?: string,
 *   watchUrl?: string,
 *   aligned?: boolean
 * }} input
 * @returns {CanonicalLiveSnapshot}
 */
export function createEmptyCanonicalSnapshot(input = {}) {
  return {
    nlsMcpSnapshotVersion: CANONICAL_SNAPSHOT_VERSION,
    meta: {
      extensionVersion: String(input.extensionVersion || ''),
      buildId: String(input.buildId || ''),
      exportedAt: Date.now(),
      seq: Number(input.seq) || 0
    },
    watch: {
      liveId: String(input.liveId || ''),
      watchUrl: String(input.watchUrl || ''),
      aligned: input.aligned !== false
    },
    gift: {},
    diag: {
      mismatchReasons: []
    }
  };
}

/**
 * CanonicalValueWithMeta を 1 件作るヘルパ。
 *
 * @param {{
 *   value: unknown,
 *   source: string,
 *   ageMs?: number | null,
 *   reason?: string | null,
 *   confidence?: number
 * }} input
 * @returns {CanonicalValueWithMeta}
 */
export function makeCanonicalValue(input) {
  const value = input.value;
  const hasValue = value !== null && value !== undefined && value !== '';
  /** @type {CanonicalValueWithMeta} */
  const out = {
    value: hasValue ? value : null,
    source: String(input.source || ''),
    ageMs: typeof input.ageMs === 'number' ? input.ageMs : null,
    reason: input.reason === undefined ? (hasValue ? null : REASON_CODES.NO_FIELD) : input.reason
  };
  if (typeof input.confidence === 'number') {
    out.confidence = input.confidence;
  }
  return out;
}
