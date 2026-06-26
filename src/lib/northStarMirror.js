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
 * @typedef {{ liveId: string, capturedAt: number, lanes: { contributionRanking: NorthStarMirrorRow[], adRanking: NorthStarMirrorRow[] } }} NorthStarMirrorSnapshot
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
 *
 * ★レーンは「キーを足すだけ」で増やす設計(=星野ロミ理論の丸ごと: popup が既に描画用に持つ rows を
 *   そのまま間引いて積む。1個ずつ自作で似せない)。contributionRanking(ギフト貢献度)に加えて
 *   adRanking(ニコニ広告の貢献度ランキング)も verbatim 保持する=純Web側で officialDomRankingRowsToStripRooms
 *   に渡せば popup と byte 一致。
 *
 * @param {{ liveId?: string, contributionRanking?: any[], adRanking?: any[] }|null|undefined} input popup が持つ各レーンの rows
 * @param {number} nowMs capturedAt(epoch ms)
 * @returns {NorthStarMirrorSnapshot}
 */
export function buildNorthStarMirrorSnapshot(input, nowMs) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    liveId: String(src.liveId || '').trim(),
    capturedAt: Number(nowMs) || 0,
    lanes: {
      contributionRanking: capRows(src.contributionRanking),
      adRanking: capRows(src.adRanking)
    }
  };
}

/**
 * 北極星レーンの合流バッファに 1 レーン分の部分更新を適用する純関数。
 *
 * ★v0.1.963(council/three-views-parity-SYNTHESIS.md P0): 貢献度と広告は別タイミングで resolve するが、
 *   同じ 1 snapshot に両方入って初めて純Web(②③)が①と一致する。popup-entry.js の publishNorthStarMirror が
 *   持っていた「liveId 単位で合流・与えたレーンだけ更新・未指定は温存・配信切替でリセット」のロジックを
 *   純関数として切り出してテスト可能にした(コピー漏れの再発防止=不変条件を単体で固定する)。
 *
 *   不変条件: 配信(liveId)が変わらない限り、各レーンへの部分更新を順不同で何回適用しても、
 *   最終バッファは「最後に与えられた各レーンの値」を両方保持する(後着が先着を消さない)。
 *
 * @param {{ liveId: string, contributionRanking: any[], adRanking: any[] }} buffer 現在の合流バッファ
 * @param {{ liveId?: string, contributionRanking?: any[], adRanking?: any[] }} patch 1 レーン分の部分更新
 * @returns {{ liveId: string, contributionRanking: any[], adRanking: any[] }} 更新後の新しいバッファ
 */
export function mergeNorthStarMirrorLanes(buffer, patch) {
  const base =
    buffer && typeof buffer === 'object'
      ? buffer
      : { liveId: '', contributionRanking: [], adRanking: [] };
  const src = patch && typeof patch === 'object' ? patch : {};
  const lid = String(src.liveId || '').trim().toLowerCase();
  // 配信が変わったら合流バッファを作り直す(古いレーンを持ち越さない)。
  const next =
    lid && lid !== base.liveId
      ? { liveId: lid, contributionRanking: [], adRanking: [] }
      : {
          liveId: lid || base.liveId,
          contributionRanking: Array.isArray(base.contributionRanking) ? base.contributionRanking : [],
          adRanking: Array.isArray(base.adRanking) ? base.adRanking : []
        };
  // 与えられたレーンだけ反映(未指定は温存)。
  if (Array.isArray(src.contributionRanking)) next.contributionRanking = src.contributionRanking;
  if (Array.isArray(src.adRanking)) next.adRanking = src.adRanking;
  return next;
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
