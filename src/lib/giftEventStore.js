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
 * v0.1.282+: 完全一致タプル dedup（純・副作用なし）。
 *
 * `appendGiftEvents(existing, incoming, now)` は 1 回の呼び出し内の incoming 全件に
 * 同一 `now` を `capturedAt` として刻む。NDGR decode は同一ギフトを msg.8 経路と
 * fallback 経路の双方で拾うことがあり、同一 tick で同一ギフトが二重 append され
 * うる（gift は `applyNdgrDedupe` の対象外＝page-intercept で post 前 drop されない）。
 * これを `userId|itemId|point|message|capturedAt` の完全一致のみで 1 件に畳む。
 *
 * capturedAt が 1ms でも違えば「別観測」とみなして残す。これにより同一ユーザーが
 * 同一アイテムを連投した正当な応援（後続 append で必ず capturedAt が進む）を
 * 誤って消さない（偽陽性ゼロ）。順序は保持する。
 *
 * @param {StoredGiftEvent[]|null|undefined} events
 * @returns {StoredGiftEvent[]}
 */
export function dedupExactGiftEvents(events) {
  if (!Array.isArray(events)) return [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {StoredGiftEvent[]} */
  const out = [];
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const key =
      String(e.userId ?? '') +
      '|' +
      String(e.itemId ?? '') +
      '|' +
      String(e.point ?? '') +
      '|' +
      String(e.message ?? '') +
      '|' +
      String(e.capturedAt ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * v0.1.282+ 北極星ピボット（feedback_north_star_priority_no_drift 2026-05-19）:
 * 観測した NDGR ギフトを送信者別に point 合計し、拡張独自の貢献度ランキングを
 * 構築する純関数。公式の貢献度ランキング（cross-origin iframe）が原理的に
 * 取得できない局面で、北極星レーン1へ placeholder で放置せず堂々と出すための
 * 主経路。集計基準はギフトポイント合計順（公式の貢献度ランキングに最も近い概念）。
 *
 * - 完全一致 dedup を内部適用（二重 append による point 二重計上を防止）
 * - userId='' の匿名ギフトは「別人を 1 人に融合」する誤認を生むため rank から除外
 *   （summarizeGiftEvents で匿名分の正直な併記は別途可能）
 * - point は数値かつ >0 のみ加算。全 point≤0 のユーザーは行を作らない
 *   （偽の 0pt ランキングを出さない＝data accuracy framework: fail-soft）
 * - sort は完全決定的: point desc → count desc → lastCapturedAt asc → userId asc
 *   （同点でも毎リフレッシュで並びがブレない）
 * - nickname は観測中で最新 capturedAt の非空を採用（途中解決で uid 表示に化けない）
 *
 * @param {StoredGiftEvent[]|null|undefined} events
 * @param {{ maxRows?: number }} [opts]
 * @returns {Array<{ rank: number, userId: string, nickname: string, point: number, count: number, lastCapturedAt: number }>}
 */
export function buildSelfAggregatedContributionRankingFromEvents(events, opts = {}) {
  if (!Array.isArray(events)) return [];
  const maxRows = positiveIntOr(opts?.maxRows, 20);
  const deduped = dedupExactGiftEvents(events);
  /** @type {Map<string, { userId: string, nickname: string, point: number, count: number, lastCapturedAt: number, lastNickAt: number }>} */
  const byUser = new Map();
  for (const e of deduped) {
    const userId = String(e?.userId ?? '').trim();
    if (!userId) continue; // 匿名（uid 空）は rank 対象外
    const point =
      typeof e?.point === 'number' && Number.isFinite(e.point) && e.point > 0
        ? e.point
        : 0;
    const capturedAt =
      typeof e?.capturedAt === 'number' && Number.isFinite(e.capturedAt)
        ? e.capturedAt
        : 0;
    const nick = String(e?.nickname ?? '').trim();
    let agg = byUser.get(userId);
    if (!agg) {
      agg = {
        userId,
        nickname: '',
        point: 0,
        count: 0,
        lastCapturedAt: 0,
        lastNickAt: -Infinity
      };
      byUser.set(userId, agg);
    }
    agg.point += point;
    agg.count += 1;
    if (capturedAt > agg.lastCapturedAt) agg.lastCapturedAt = capturedAt;
    if (nick && capturedAt >= agg.lastNickAt) {
      agg.nickname = nick;
      agg.lastNickAt = capturedAt;
    }
  }
  const rows = [...byUser.values()].filter((a) => a.point > 0);
  rows.sort((a, b) => {
    if (b.point !== a.point) return b.point - a.point;
    if (b.count !== a.count) return b.count - a.count;
    if (a.lastCapturedAt !== b.lastCapturedAt) {
      return a.lastCapturedAt - b.lastCapturedAt;
    }
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
  return rows.slice(0, maxRows).map((a, i) => ({
    rank: i + 1,
    userId: a.userId,
    nickname: a.nickname,
    point: a.point,
    count: a.count,
    lastCapturedAt: a.lastCapturedAt
  }));
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
