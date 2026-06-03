/**
 * 北極星ギフト履歴: 公式番組累計 pt と履歴 API 合計の表示整合（v0.1.581）。
 * 完全な履歴取得ができない場合でも、ヘッダ・右サマリーは公式累計に揃える。
 */

/** @type {string} */
export const GIFT_HISTORY_UNATTRIBUTED_USER_KEY = '__gift_unattributed__';

/**
 * @param {number|null|undefined} historySumAll
 * @param {number|null|undefined} officialPts
 * @returns {number}
 */
export function giftHistoryGapToOfficial(historySumAll, officialPts) {
  if (
    typeof officialPts !== 'number' ||
    !Number.isFinite(officialPts) ||
    officialPts < 0
  ) {
    return 0;
  }
  const hist = Math.max(0, Math.floor(Number(historySumAll) || 0));
  return Math.max(0, Math.floor(officialPts) - hist);
}

/**
 * @param {{
 *   historySumDisplayed?: number|null,
 *   historySumAll?: number|null,
 *   officialProgramGiftPts?: number|null
 * }} p
 * @returns {{
 *   summaryPoints: number,
 *   historySumAll: number,
 *   historySumDisplayed: number,
 *   gapPoints: number,
 *   usesOfficialSummary: boolean
 * }}
 */
export function resolveGiftHistorySummaryPoints(p = {}) {
  const histDisp = Math.max(0, Math.floor(Number(p.historySumDisplayed) || 0));
  const histAll = Math.max(0, Math.floor(Number(p.historySumAll) || 0));
  const official =
    typeof p.officialProgramGiftPts === 'number' &&
    Number.isFinite(p.officialProgramGiftPts) &&
    p.officialProgramGiftPts >= 0
      ? Math.floor(p.officialProgramGiftPts)
      : null;
  if (official != null) {
    return {
      summaryPoints: official,
      historySumAll: histAll,
      historySumDisplayed: histDisp,
      gapPoints: Math.max(0, official - histAll),
      usesOfficialSummary: true
    };
  }
  const fallback = histDisp > 0 ? histDisp : histAll;
  return {
    summaryPoints: fallback,
    historySumAll: histAll,
    historySumDisplayed: histDisp,
    gapPoints: 0,
    usesOfficialSummary: false
  };
}

/**
 * 公式累計との差分を「履歴未取得」行としてランキングに足す（上位表示の合計が公式に届くように）。
 *
 * @param {readonly { userKey?: string; nickname?: string; count?: number; avatarUrl?: string }[]} rooms
 * @param {number} gapPoints
 * @param {number} maxRooms
 * @returns {{ userKey: string; nickname: string; count: number; avatarUrl: string }[]}
 */
export function appendUnattributedGiftRoom(rooms, gapPoints, maxRooms) {
  const gap = Math.max(0, Math.floor(Number(gapPoints) || 0));
  const normalizedRooms = rooms.map((r) => ({
    userKey: String(r.userKey || ''),
    nickname: String(r.nickname || ''),
    count: Math.max(0, Math.floor(Number(r.count) || 0)),
    avatarUrl: String(r.avatarUrl || '')
  }));
  if (gap <= 0) return normalizedRooms;
  const cap =
    typeof maxRooms === 'number' && Number.isFinite(maxRooms) && maxRooms > 0
      ? Math.trunc(maxRooms)
      : 10;
  const row = {
    userKey: GIFT_HISTORY_UNATTRIBUTED_USER_KEY,
    nickname: '履歴未取得',
    count: gap,
    avatarUrl: ''
  };
  const merged = [...normalizedRooms, row].sort(
    (a, b) =>
      (Number(b.count) || 0) - (Number(a.count) || 0) ||
      String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ja')
  );
  return merged.slice(0, cap);
}

/**
 * @param {{
 *   rooms: { userKey: string; nickname: string; count: number; avatarUrl?: string }[];
 *   pointsSumAll?: number;
 *   pointsSumDisplayed?: number;
 *   officialProgramGiftPts?: number|null;
 *   maxRooms?: number;
 * }} ctx
 */
export function reconcileGiftHistoryNorthStarContext(ctx) {
  const rooms = Array.isArray(ctx.rooms) ? ctx.rooms : [];
  const histAll = Math.max(
    0,
    Math.floor(
      Number(ctx.pointsSumAll) ||
        rooms.reduce((s, r) => s + (Number(r.count) || 0), 0)
    )
  );
  const histDisp = Math.max(
    0,
    Math.floor(
      Number(ctx.pointsSumDisplayed) ||
        rooms.reduce((s, r) => s + (Number(r.count) || 0), 0)
    )
  );
  const resolved = resolveGiftHistorySummaryPoints({
    historySumAll: histAll,
    historySumDisplayed: histDisp,
    officialProgramGiftPts: ctx.officialProgramGiftPts
  });
  const maxRooms =
    typeof ctx.maxRooms === 'number' && ctx.maxRooms > 0 ? ctx.maxRooms : 10;
  const nextRooms =
    resolved.gapPoints > 0
      ? appendUnattributedGiftRoom(rooms, resolved.gapPoints, maxRooms)
      : rooms;
  return {
    rooms: nextRooms,
    pointsSumAll: resolved.usesOfficialSummary ? resolved.summaryPoints : histAll,
    pointsSumDisplayed: resolved.summaryPoints,
    historySumAll: histAll,
    gapPoints: resolved.gapPoints,
    usesOfficialSummary: resolved.usesOfficialSummary
  };
}
