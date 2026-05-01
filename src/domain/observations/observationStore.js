/**
 * observationStore - StatObservation のメモリ常駐リングバッファ。
 *
 * 設計（Opus 4.7 Phase 2: 薄く始める）:
 *   いきなり EventSourced を実装しない。直近 N 観測を保持するだけのリングから始める。
 *   後から「liveId 別に保持」「永続化」「集計」が必要になったら拡張する。
 *
 *   メモリ常駐のみ - 永続化しない。プライバシー方針（StorageGuard）と整合させ、
 *   再起動で消える。観測ログは HTML エクスポート時に optional でスナップショット
 *   される予定（Phase 4）。
 *
 * 既存コード非干渉:
 *   - concurrentEstimate.js / wsStatisticsExtract.js / page-intercept-entry.js は触らない
 *   - 配線は Phase 3（concurrentInputBuilder 経由）
 *
 * 不変条件:
 *   - capacity を絶対に超えない（FIFO eviction）
 *   - record(null / 非 observation) は無視（false 返却）
 *   - recent / recentForLiveId は frozen array を返す
 *   - 新しい順（newest first）
 */

/**
 * @typedef {import('./StatObservation.js').StatObservation} StatObservation
 */

/**
 * @typedef {{
 *   capacity?: unknown
 * }} ObservationStoreOptions
 */

/**
 * @typedef {{
 *   capacity: () => number,
 *   size: () => number,
 *   record: (observation: unknown) => boolean,
 *   recent: (limit?: number) => readonly StatObservation[],
 *   recentForLiveId: (liveId: unknown, limit?: number) => readonly StatObservation[],
 *   clear: () => void
 * }} ObservationStore
 */

const DEFAULT_CAPACITY = 60;

/**
 * @param {unknown} c
 * @returns {c is number}
 */
function isValidCapacity(c) {
  return (
    typeof c === 'number' &&
    Number.isFinite(c) &&
    Number.isInteger(c) &&
    c >= 1
  );
}

/**
 * StatObservation の形をしているかの shape check。
 * createStatObservation の返り値は frozen object なので、不正な値は混入しない前提。
 *
 * @param {unknown} o
 * @returns {o is StatObservation}
 */
function isObservationLike(o) {
  if (!o || typeof o !== 'object') return false;
  const obj = /** @type {Record<string, unknown>} */ (o);
  return (
    typeof obj.liveId === 'string' &&
    typeof obj.value === 'number' &&
    typeof obj.semantic === 'string' &&
    typeof obj.source === 'string' &&
    typeof obj.observedAt === 'number'
  );
}

/**
 * @param {unknown} limit
 * @returns {number | null}
 */
function normalizeLimit(limit) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return null;
  const n = Math.floor(limit);
  return n < 0 ? 0 : n;
}

/**
 * @param {ObservationStoreOptions} [options]
 * @returns {ObservationStore}
 */
export function createObservationStore(options = {}) {
  const capacity = isValidCapacity(options?.capacity)
    ? /** @type {number} */ (options.capacity)
    : DEFAULT_CAPACITY;

  /** @type {StatObservation[]} */
  const buffer = [];

  return Object.freeze({
    capacity: () => capacity,
    size: () => buffer.length,

    /**
     * @param {unknown} observation
     * @returns {boolean}
     */
    record(observation) {
      if (!isObservationLike(observation)) return false;
      buffer.push(/** @type {StatObservation} */ (observation));
      // FIFO eviction で capacity を絶対に超えない
      while (buffer.length > capacity) {
        buffer.shift();
      }
      return true;
    },

    /**
     * @param {number} [limit]
     * @returns {readonly StatObservation[]}
     */
    recent(limit) {
      const reversed = buffer.slice().reverse();
      const lim = normalizeLimit(limit);
      const out = lim === null ? reversed : reversed.slice(0, lim);
      return Object.freeze(out);
    },

    /**
     * @param {unknown} liveId
     * @param {number} [limit]
     * @returns {readonly StatObservation[]}
     */
    recentForLiveId(liveId, limit) {
      if (typeof liveId !== 'string') return Object.freeze([]);
      const trimmed = liveId.trim();
      if (!trimmed) return Object.freeze([]);
      const filtered = buffer.filter((o) => o.liveId === trimmed).reverse();
      const lim = normalizeLimit(limit);
      const out = lim === null ? filtered : filtered.slice(0, lim);
      return Object.freeze(out);
    },

    clear() {
      buffer.length = 0;
    }
  });
}
