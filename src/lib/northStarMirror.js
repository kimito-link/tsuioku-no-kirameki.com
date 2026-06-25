/**
 * 北極星レーン鏡(公式値レーン)のスナップショット純関数。
 *
 * popup が計算済みの北極星レーン(まずは contributionRanking=ギフト貢献度)の rows を、純Web版
 * (app/live-view)へ相乗り送信できる JSON-safe な形に間引く。laneMirror / statCardsMirror と同じ轍。
 *
 *   - 上位 cap 件に間引く(payload を肥大させない)
 *   - row は paint 側(officialDomRankingRowsToStripRooms → paintTopSupportRankStyleIntoElement)が
 *     必要とするフィールドだけに絞る(非列挙プロパティ/関数を持ち込まない=JSON-safe)
 *   - liveId / capturedAt 同梱(鮮度・対象配信判定)
 *   - lanes.<laneId> 構造=将来 giftHistory 等のレーンを足すときはキーを足すだけ
 *
 * chrome 非依存。
 *
 * @module northStarMirror
 */

/** 1レーンあたりの上限件数(ニコ生本体表示と揃え 1-10 位が正本)。 */
const NORTH_STAR_LANE_ROW_CAP = 10;

/**
 * @typedef {{ rank: number, userId: string, name: string, avatarUrl: string, count: number }} NorthStarMirrorRow
 * @typedef {{ liveId: string, capturedAt: number, lanes: { contributionRanking: NorthStarMirrorRow[] } }} NorthStarMirrorSnapshot
 */

/** 1 row を paint が必要とするフィールドだけに絞る(JSON-safe)。 */
function toMirrorRow(/** @type {any} */ r, /** @type {number} */ i) {
  return {
    rank: Number(r?.rank) || i + 1,
    userId: String(r?.userId || '').trim(),
    // 表示名は name 優先・無ければ nickname(officialDomRankingRowsToStripRooms と同じ拾い方)。
    name: String(r?.name || r?.nickname || '').trim(),
    avatarUrl: String(r?.avatarUrl || r?.thumbnailUrl || '').trim(),
    count: Number(r?.count) || 0
  };
}

/** @param {unknown} rows @returns {NorthStarMirrorRow[]} */
function capRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.slice(0, NORTH_STAR_LANE_ROW_CAP).map(toMirrorRow);
}

/**
 * 北極星レーン鏡スナップショットを作る。
 * @param {{ liveId?: string, contributionRanking?: any[] }|null|undefined} input popup が持つ各レーンの rows
 * @param {number} nowMs capturedAt(epoch ms)
 * @returns {NorthStarMirrorSnapshot}
 */
export function buildNorthStarMirrorSnapshot(input, nowMs) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    liveId: String(src.liveId || '').trim(),
    capturedAt: Number(nowMs) || 0,
    lanes: {
      contributionRanking: capRows(src.contributionRanking)
    }
  };
}

/**
 * スナップショットから指定レーンの rows を取り出す(純Web の paint に渡す)。
 * @param {NorthStarMirrorSnapshot|null|undefined} snap
 * @param {string} laneId
 * @returns {NorthStarMirrorRow[]}
 */
export function restoreNorthStarMirrorRows(snap, laneId) {
  const lanes = snap && typeof snap === 'object' && snap.lanes && typeof snap.lanes === 'object'
    ? /** @type {Record<string, any>} */ (snap.lanes)
    : null;
  if (!lanes) return [];
  const rows = lanes[String(laneId || '')];
  return Array.isArray(rows) ? rows : [];
}
