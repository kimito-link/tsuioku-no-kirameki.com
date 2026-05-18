/**
 * v0.1.206 Phase A: NDGR gift event の時系列ストア（純関数）。
 *
 * v0.1.204 で proto 準拠 decode が確立、v0.1.205 prep で intercept 経路が新フィールド
 * (itemId / itemName / point / message / contributionRank) を payload に同梱した。
 * 本 lib では個別 event を時系列で保存し、ranking と履歴を構築する。
 *
 * 既存 mergeGiftUsers（throwCount 集約）とは別経路。この lib は「個別 event の
 * 詳細を保持」する役割で、ranking 構築や履歴一覧で使う。
 *
 * 副作用なし。
 */

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   itemId: string,
 *   itemName: string,
 *   point: number,
 *   message: string,
 *   contributionRank: number|null,
 *   capturedAt: number
 * }} StoredGiftEvent
 *
 * @typedef {{
 *   userId?: string,
 *   nickname?: string,
 *   itemId?: string,
 *   itemName?: string,
 *   point?: number,
 *   message?: string,
 *   contributionRank?: number
 * }} IncomingGiftEvent
 *
 * @typedef {{
 *   next: StoredGiftEvent[],
 *   added: StoredGiftEvent[],
 *   storageTouched: boolean
 * }} GiftEventAppendResult
 */

const DEFAULT_MAX_EVENTS = 500;

/**
 * 既存 events リストに新 event を追加。容量超過時は FIFO で古いものを削る。
 *
 * @param {StoredGiftEvent[]|null|undefined} existing
 * @param {IncomingGiftEvent[]|null|undefined} incoming
 * @param {number} now
 * @param {number} [maxEvents]
 * @returns {GiftEventAppendResult}
 */
export function appendGiftEvents(
  existing,
  incoming,
  now,
  maxEvents = DEFAULT_MAX_EVENTS
) {
  const base = Array.isArray(existing) ? existing : [];
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { next: base, added: [], storageTouched: false };
  }
  /** @type {StoredGiftEvent[]} */
  const added = [];
  const result = [...base];
  for (const inc of incoming) {
    const event = normalizeGiftEvent(inc, now);
    if (!event) continue;
    result.push(event);
    added.push(event);
  }
  if (added.length === 0) {
    return { next: base, added: [], storageTouched: false };
  }
  const cap = positiveIntOr(maxEvents, DEFAULT_MAX_EVENTS);
  const trimmed = result.length > cap ? result.slice(-cap) : result;
  return { next: trimmed, added, storageTouched: true };
}

/**
 * contribution_rank が来ている event だけを抽出して、ranking 順にソート。
 * 同じ userId の複数 event がある場合は最新の capturedAt を採用。
 *
 * @param {StoredGiftEvent[]|null|undefined} events
 * @returns {Array<{rank: number, userId: string, nickname: string, point: number, capturedAt: number}>}
 */
export function buildContributionRankingFromEvents(events) {
  if (!Array.isArray(events)) return [];
  /** @type {Map<string, {rank: number, userId: string, nickname: string, point: number, capturedAt: number}>} */
  const latest = new Map();
  for (const e of events) {
    if (
      typeof e?.contributionRank !== 'number' ||
      !Number.isFinite(e.contributionRank) ||
      e.contributionRank <= 0
    ) {
      continue;
    }
    const uid = e.userId || `__anon_${e.itemId || 'x'}_${e.capturedAt}`;
    const existing = latest.get(uid);
    if (!existing || e.capturedAt > existing.capturedAt) {
      latest.set(uid, {
        rank: e.contributionRank,
        userId: e.userId,
        nickname: e.nickname,
        point: e.point,
        capturedAt: e.capturedAt
      });
    }
  }
  return [...latest.values()].sort((a, b) => a.rank - b.rank);
}

/**
 * 直近 N 件のギフト履歴を時系列降順で返す。
 *
 * @param {StoredGiftEvent[]|null|undefined} events
 * @param {number} [limit]
 * @returns {Array<{senderName: string, points: number, itemName: string, capturedAt: number}>}
 */
export function buildGiftHistoryFromEvents(events, limit = 5) {
  if (!Array.isArray(events)) return [];
  const cap = positiveIntOr(limit, 5);
  return [...events]
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, cap)
    .map((e) => ({
      senderName: e.nickname || (e.userId ? `u/${e.userId}` : '名無し'),
      points: e.point,
      itemName: e.itemName,
      capturedAt: e.capturedAt
    }));
}

/**
 * 配信単位の合計ポイントとイベント数を計算する。
 *
 * @param {StoredGiftEvent[]|null|undefined} events
 * @returns {{ totalEvents: number, totalPoints: number, uniqueSenders: number }}
 */
export function summarizeGiftEvents(events) {
  if (!Array.isArray(events)) {
    return { totalEvents: 0, totalPoints: 0, uniqueSenders: 0 };
  }
  let totalPoints = 0;
  /** @type {Set<string>} */
  const senders = new Set();
  for (const e of events) {
    totalPoints += typeof e?.point === 'number' && Number.isFinite(e.point) ? e.point : 0;
    if (e?.userId) senders.add(e.userId);
  }
  return {
    totalEvents: events.length,
    totalPoints,
    uniqueSenders: senders.size
  };
}

/**
 * @param {IncomingGiftEvent|null|undefined} raw
 * @param {number} now
 * @returns {StoredGiftEvent|null}
 */
function normalizeGiftEvent(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const userId = String(raw.userId ?? '').trim();
  const nickname = String(raw.nickname ?? '').trim();
  const itemId = String(raw.itemId ?? '').trim();
  const itemName = String(raw.itemName ?? '').trim();
  const point =
    typeof raw.point === 'number' && Number.isFinite(raw.point) ? raw.point : 0;
  const message = String(raw.message ?? '').trim();
  const contributionRank =
    typeof raw.contributionRank === 'number' && Number.isFinite(raw.contributionRank)
      ? raw.contributionRank
      : null;
  // userId / itemId / itemName のいずれかが取れていれば valid
  if (!userId && !itemId && !itemName && !nickname) return null;
  return {
    userId,
    nickname,
    itemId,
    itemName,
    point,
    message,
    contributionRank,
    capturedAt: now
  };
}

/**
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function positiveIntOr(v, fallback) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return Math.floor(v);
  }
  return fallback;
}
