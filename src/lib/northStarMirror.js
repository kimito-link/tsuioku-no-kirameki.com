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
 * ★row の正本フィールドは officialDomRankingRowsToStripRooms(src/lib)が読むものに【完全一致】させる。
 *   そこは name(+alt) / contribution / thumbnailUrl / rank / isAnonymous / userPageUrl を読む。
 *   勝手に count/avatarUrl にリネームすると純Web の描画が popup とズレる(=似せて自作の轍)。
 *   だから「そのまま間引く(必要フィールドだけ verbatim 抽出)」=純Web で同じ関数に渡せば byte 一致。
 * @typedef {{ rank?: number, name?: string, contribution?: number, thumbnailUrl?: string, isAnonymous?: boolean, userPageUrl?: string }} NorthStarMirrorRow
 * @typedef {{ liveId: string, capturedAt: number, lanes: { contributionRanking: NorthStarMirrorRow[] } }} NorthStarMirrorSnapshot
 */

/** 1 row を officialDomRankingRowsToStripRooms が読むフィールドだけに絞る(verbatim・JSON-safe)。 */
function toMirrorRow(/** @type {any} */ r) {
  const row = r && typeof r === 'object' ? r : {};
  const out = /** @type {NorthStarMirrorRow} */ ({});
  // officialDomRankingRowsToStripRooms / pickOfficialRankDisplayName が読むフィールドを verbatim 保持。
  if (typeof row.rank === 'number' && Number.isFinite(row.rank)) out.rank = row.rank;
  out.contribution = Number(row.contribution) || 0;
  out.thumbnailUrl = String(row.thumbnailUrl ?? '').trim();
  out.isAnonymous = Boolean(row.isAnonymous);
  const upu = String(row.userPageUrl ?? '').trim();
  if (upu) out.userPageUrl = upu;
  // 表示名: name + alt フォールバック群(pickOfficialRankDisplayName と同じ)を拾える分だけ。
  for (const f of ['name', 'thumbnailAltName', 'thumbnailAlt', 'avatarAlt', 'imageAlt', 'alt']) {
    const s = String(row[f] == null ? '' : row[f]).trim();
    if (s) { out.name = s; break; }
  }
  return out;
}

/** @param {unknown} rows @returns {NorthStarMirrorRow[]} */
function capRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.slice(0, NORTH_STAR_LANE_ROW_CAP).map((r) => toMirrorRow(r));
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
