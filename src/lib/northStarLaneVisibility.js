/**
 * 北極星レーンの表示/非表示を `data-lane-state` から決める純関数（副作用なし）。
 *
 * 方針（ユーザー明示 2026-05-18 + durable: 北極星の核は隠さない）:
 * - コア2レーン `contributionRanking` / `giftHistory`（＝来場者を見える化する
 *   プログラムの存在意義。公式が無くても NDGR 拡張集計で埋める前提）は
 *   取得可否に関わらず**常設**＝常に表示。
 * - 補助レーン（`programPoints` 番組累計pt / `adRanking` 広告ランキング /
 *   `eventScore` イベント累計スコア / `eventRank` イベント現在順位）は
 *   `ok`（データ有り）か `not_yet`（起動直後の一過性ロード中＝pop-in jank
 *   回避のため隠さない）のときだけ表示。`no_event`（イベント不参加）/
 *   `missing` / `iframe_unrendered` / `fetch_error` / `no_program_gift` は
 *   「不参加・空・取得不能」として完全非表示にしスペースを無駄にしない。
 */

/** コア2レーン（取得可否に関わらず常設） */
const CORE_LANE_IDS = new Set(['contributionRanking', 'giftHistory']);

/**
 * 補助レーンを表示する lane-state。
 * v0.1.282: `event_present_unscrapable`（NDGR 等でイベント参加を検出したが
 * 公式の順位/スコアを cross-origin iframe から取得できない）を可視に追加。
 * 「参加中なのにレーンごと消える」issue3 副作用をこの state に限り解除し、
 * 「イベント参加中・公式順位取得困難」を表示する（ユーザー報告 2026-05-18）。
 */
const AUXILIARY_VISIBLE_STATES = new Set([
  'ok',
  'not_yet',
  'event_present_unscrapable'
]);

/**
 * @param {unknown} laneId `northStarLaneBody-` 接尾辞（例: 'eventScore'）
 * @param {unknown} laneState `data-lane-state`（'ok'|'no_event'|'not_yet' 等）
 * @returns {boolean} レーン枠を表示するなら true
 */
export function shouldShowNorthStarLane(laneId, laneState) {
  const id = String(laneId ?? '').trim();
  // lane 不明（接尾辞が取れない）のときは安全側＝隠さない
  if (!id) return true;
  if (CORE_LANE_IDS.has(id)) return true;
  const s = String(laneState ?? '').trim();
  return AUXILIARY_VISIBLE_STATES.has(s);
}
