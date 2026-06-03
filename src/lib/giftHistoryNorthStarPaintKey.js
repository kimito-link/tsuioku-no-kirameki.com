/**
 * 北極星ギフト履歴レーンの再描画スキップ用キー（v0.1.582）。
 * 鮮度注記（「○秒前」）はキーに含めない — 別途テキストだけ更新する。
 */

/**
 * @param {string} s
 * @returns {string}
 */
function foldString(s) {
  const t = String(s || '');
  if (t.length <= 4000) return t;
  return `${t.length}:${t.slice(0, 2000)}:${t.slice(-200)}`;
}

/**
 * @param {{
 *   liveId?: string,
 *   rooms?: readonly { userKey?: string; count?: number }[],
 *   noteText?: string,
 *   pointsSumAll?: number|null,
 *   pointsSumDisplayed?: number|null,
 *   officialProgramGiftPts?: number|null,
 *   throwsTableHtml?: string
 * }} p
 * @returns {string}
 */
export function buildGiftHistoryNorthStarPaintKey(p = {}) {
  const rooms = Array.isArray(p.rooms) ? p.rooms : [];
  const roomPart = rooms
    .map((r) => `${String(r.userKey || '')}:${Math.floor(Number(r.count) || 0)}`)
    .join(';');
  return [
    String(p.liveId || '').trim().toLowerCase(),
    roomPart,
    foldString(p.noteText || ''),
    p.pointsSumAll ?? '',
    p.pointsSumDisplayed ?? '',
    p.officialProgramGiftPts ?? '',
    foldString(p.throwsTableHtml || '')
  ].join('\n');
}
