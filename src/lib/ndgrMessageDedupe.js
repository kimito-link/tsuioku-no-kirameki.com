/**
 * v0.1.238: NDGR Message ID dedupe
 *
 * NDGR 受信メッセージの重複排除。配信切替時 reset、live ごと FIFO eviction、
 * 観測値の subsystem 化を満たす純関数ファクトリ。
 *
 * 設計根拠（4 軸独立調査が完全一致、2026-05-10）:
 * - Codex niconico 系深読み: NdgrClientSharp の `Dictionary<string, HashSet<string>>` を
 *   `Map<liveId, { ids: Set, fifo: string[] }>` で再構成。canonical key は `liveId + ":" + messageId`
 *   （C# の segmentUri-only は backward fetch / relay overlap に弱い）
 * - 分散システム semantics: ordering=commentNo / dedupe=messageId の役割分離
 *   （Kafka, Kinesis, MQTT, gRPC で確立）
 * - Bilibili scale: protocol ID を主キーに、seen-set は retry/backfill 窓だけ保持
 *   （TTL 10 分は Telegram MTProto の 300 秒上限とも一致）
 *
 * 7 原則:
 * 1. ordering=commentNo / dedupe=messageId 役割分離
 * 2. dedupe は decode 直後（post 前）
 * 3. canonical key = `liveId + ":" + messageId`
 * 4. bounded window: FIFO `perLiveMax` cap
 * 5. replay は contract（重複は drop）
 * 6. at-least-once + idempotency と明示
 * 7. drop 件数を必ず観測層に出す
 *
 * 詳細: memory analysis_distributed_dedupe.md / plan_v0239_message_id_dedupe.md
 */

/**
 * @typedef {{
 *   accepted: number,
 *   droppedDuplicate: number,
 *   evictedIds: number,
 *   bucketsCreated: number,
 *   bucketsCleared: number,
 *   resets: number,
 *   lastResetLiveId: string|null
 * }} NdgrDedupeStats
 */

/**
 * @typedef {{
 *   currentLiveId: string|null,
 *   currentBuckets: number,
 *   accepted: number,
 *   droppedDuplicate: number,
 *   evictedIds: number,
 *   bucketsCreated: number,
 *   bucketsCleared: number,
 *   resets: number,
 *   lastResetLiveId: string|null
 * }} NdgrDedupeSnapshot
 */

/**
 * @typedef {'first-seen'|'duplicate'|'no-id'|'invalid-key'} NdgrDedupeReason
 */

/**
 * @typedef {{ accepted: boolean, reason: NdgrDedupeReason }} NdgrDedupeResult
 */

/**
 * Dedupe ファクトリ。各拡張インスタンスで 1 つだけ作る想定。
 *
 * @param {{ perLiveMax?: number }} [opts] perLiveMax: live ごとの保持上限（FIFO eviction）
 *   既定 4096。Codex の C# 実装、Bilibili scale TOP 5、分散 D 原則の合意値。
 *   1 配信平均 1〜10 万メッセージで全体重複は通常 reconnect burst の数十件規模なので
 *   4096 で実用上 collision なし。
 * @returns {{
 *   accept: (input: { liveId?: string|null, messageId?: string|null }) => NdgrDedupeResult,
 *   resetForLive: (nextLiveId: string|null) => void,
 *   clearOtherLives: (keepLiveId: string) => void,
 *   snapshot: () => NdgrDedupeSnapshot,
 *   clear: () => void
 * }}
 */
export function createNdgrMessageDedupe({ perLiveMax = 4096 } = {}) {
  /** @type {Map<string, { ids: Set<string>, fifo: string[] }>} */
  const buckets = new Map();
  /** @type {NdgrDedupeStats} */
  const stats = {
    accepted: 0,
    droppedDuplicate: 0,
    evictedIds: 0,
    bucketsCreated: 0,
    bucketsCleared: 0,
    resets: 0,
    lastResetLiveId: null,
  };
  /** @type {string|null} */
  let currentLiveId = null;

  /**
   * dedupe 判定。messageId / liveId が無いときは pass-through（false positive 回避）。
   *
   * @param {{ liveId?: string|null, messageId?: string|null }} input
   * @returns {NdgrDedupeResult}
   */
  function accept(input) {
    const messageId = input?.messageId;
    if (!messageId) return { accepted: true, reason: 'no-id' };

    const lid = String(input?.liveId || '').toLowerCase();
    const mid = String(messageId).trim();
    if (!lid || !mid) return { accepted: true, reason: 'invalid-key' };

    let bucket = buckets.get(lid);
    if (!bucket) {
      bucket = { ids: new Set(), fifo: [] };
      buckets.set(lid, bucket);
      stats.bucketsCreated += 1;
    }
    if (bucket.ids.has(mid)) {
      stats.droppedDuplicate += 1;
      return { accepted: false, reason: 'duplicate' };
    }
    bucket.ids.add(mid);
    bucket.fifo.push(mid);
    while (bucket.fifo.length > perLiveMax) {
      const old = bucket.fifo.shift();
      if (old) {
        bucket.ids.delete(old);
        stats.evictedIds += 1;
      }
    }
    stats.accepted += 1;
    return { accepted: true, reason: 'first-seen' };
  }

  /**
   * 配信切替検知。currentLiveId が変わったら stats.resets を進める。
   * 既存 bucket 自体は維持する（同 lid の継続のため）。別 lid を消したいときは
   * clearOtherLives() を併用する。
   *
   * @param {string|null} nextLiveId
   */
  function resetForLive(nextLiveId) {
    const next = nextLiveId == null ? null : String(nextLiveId).toLowerCase();
    if (currentLiveId !== next) {
      stats.resets += 1;
      stats.lastResetLiveId = next;
      currentLiveId = next;
    }
  }

  /**
   * 指定 live 以外の bucket を破棄する。tab 切替・配信終了時のメモリ解放用。
   *
   * @param {string} keepLiveId
   */
  function clearOtherLives(keepLiveId) {
    const keep = String(keepLiveId || '').toLowerCase();
    for (const lid of Array.from(buckets.keys())) {
      if (lid !== keep) {
        buckets.delete(lid);
        stats.bucketsCleared += 1;
      }
    }
  }

  /**
   * 観測層用の plain object snapshot。structured clone 可能（postMessage 安全）。
   *
   * @returns {NdgrDedupeSnapshot}
   */
  function snapshot() {
    return {
      currentLiveId,
      currentBuckets: buckets.size,
      accepted: stats.accepted,
      droppedDuplicate: stats.droppedDuplicate,
      evictedIds: stats.evictedIds,
      bucketsCreated: stats.bucketsCreated,
      bucketsCleared: stats.bucketsCleared,
      resets: stats.resets,
      lastResetLiveId: stats.lastResetLiveId,
    };
  }

  function clear() {
    if (buckets.size > 0) stats.bucketsCleared += buckets.size;
    buckets.clear();
    // v0.1.356: currentLiveId もリセットする。従来は buckets だけ消して currentLiveId が
    //   古い lv のまま残り、clear 後に同じ lv で resetForLive しても切替扱いにならず
    //   （buckets 空なのに live 継続中という不整合）。clear は「完全な初期化」なので null に戻す。
    currentLiveId = null;
  }

  return { accept, resetForLive, clearOtherLives, snapshot, clear };
}
