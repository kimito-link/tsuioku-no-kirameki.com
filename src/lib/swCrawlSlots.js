/**
 * SW backfill の per-lid 並列スロット判定。
 *
 * chrome API やタイマーには依存せず、呼び出し側が保持する registry のキーだけから
 * start/retry の状態遷移を決める。
 *
 * @module swCrawlSlots
 */

/**
 * SW backfill の lid を storage key と同じ規約へ正規化する。
 *
 * @param {unknown} lid
 * @returns {string}
 */
export function normalizeSwLid(lid) {
  return String(lid).trim().toLowerCase();
}

/**
 * @param {Iterable<unknown>} runningLids
 * @returns {Set<string>}
 */
function normalizedRunningLids(runningLids) {
  const normalized = new Set();
  if (!runningLids || typeof runningLids[Symbol.iterator] !== 'function') {
    return normalized;
  }
  for (const runningLid of runningLids) {
    const lid = normalizeSwLid(runningLid);
    if (lid) normalized.add(lid);
  }
  return normalized;
}

/**
 * @param {number} maxParallel
 * @returns {number}
 */
function normalizedMaxParallel(maxParallel) {
  return Math.max(1, Math.floor(Number(maxParallel) || 0));
}

/**
 * 新規 start の受理可否を判定する。
 *
 * @param {{
 *   runningLids: Iterable<unknown>,
 *   lid: unknown,
 *   maxParallel: number
 * }} args
 * @returns {{
 *   ok: boolean,
 *   start: boolean,
 *   reason: 'ok'|'already_running'|'no_slot'|'bad_lid'
 * }}
 */
export function resolveSwCrawlStart({ runningLids, lid, maxParallel }) {
  const normalizedLid = normalizeSwLid(lid);
  if (!normalizedLid) {
    return { ok: false, start: false, reason: 'bad_lid' };
  }

  const running = normalizedRunningLids(runningLids);
  if (running.has(normalizedLid)) {
    return { ok: true, start: false, reason: 'already_running' };
  }
  if (running.size >= normalizedMaxParallel(maxParallel)) {
    return { ok: false, start: false, reason: 'no_slot' };
  }
  return { ok: true, start: true, reason: 'ok' };
}

/**
 * retry timer 発火時の処理を判定する。
 *
 * @param {{
 *   runningLids: Iterable<unknown>,
 *   lid: unknown,
 *   maxParallel: number,
 *   scheduledAt: number,
 *   now: number,
 *   maxPendingMs: number
 * }} args
 * @returns {{action: 'run'|'drop_running'|'reschedule'|'drop_expired'}}
 */
export function resolveSwRetryFire({
  runningLids,
  lid,
  maxParallel,
  scheduledAt,
  now,
  maxPendingMs
}) {
  const normalizedLid = normalizeSwLid(lid);
  const running = normalizedRunningLids(runningLids);
  if (running.has(normalizedLid)) {
    return { action: 'drop_running' };
  }

  if (running.size >= normalizedMaxParallel(maxParallel)) {
    const elapsed = Number(now) - Number(scheduledAt);
    const pendingLimit = Math.max(0, Number(maxPendingMs) || 0);
    if (Number.isFinite(elapsed) && elapsed > pendingLimit) {
      return { action: 'drop_expired' };
    }
    return { action: 'reschedule' };
  }

  return { action: 'run' };
}
