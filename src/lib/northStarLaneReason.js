/**
 * v0.1.244: 北極星「公式値レーン」の state 細分化用、reason 判定純関数。
 *
 * 既存 (v0.1.236+) では `data-lane-state` が `'missing'` / `'ok'` の 2 値だけで、
 * popup ユーザーには「何故 missing なのか」が伝わらなかった。本関数は bundle と
 * snapshot から各レーンの reason を決定し、popup CSS の `::after` placeholder で
 * 「(イベント不参加)」「(ギフト 0 件)」「(サイドバー描画なし)」等を出し分ける。
 *
 * 設計（memory `plan_north_star_mirror_rendering.md` 落とし穴 3 で計画化）:
 * - `ok` ... 値が取れている
 * - `no_event` ... イベント不参加配信（banner DOM 自体が無い、NDGR title/rank/score も無い）
 * - `no_program_gift` ... ギフト 0 件配信（programStats.giftPoints が null）
 * - `iframe_unrendered` ... gift sidebar の cross-origin iframe Vue mount 不全
 * - `fetch_error` ... 経路 A fetch が失敗
 * - `not_yet` ... 起動直後でまだ poll/scan 未完了
 * - `missing` ... 上記いずれでもない fallback
 *
 * 純関数。副作用なし。bundle / snap が null でも安全。
 */

/**
 * v0.1.282: `event_present_unscrapable` を追加。NDGR がイベント存在を示す
 * （順位/タイトル/スコアの presence）のに cross-origin iframe から公式の
 * 順位・スコアを scrape できないケース。「イベント参加中・公式順位は取得
 * できていません」を定性表示する。`feedback_ndgr_field6_silence` は NDGR
 * の順位"数値"表示を禁じるが、参加事実の定性推論は許容（会議室確認 2026-05-18）。
 * ⛔ 2026-05-19: 当初は補助レーンの可視 state として whitelist していたが、
 * 「表示できる数値が常に無い空レーンがスペースを浪費する」とユーザー実機指摘
 * （lv350522265）。`northStarLaneVisibility` の可視 set から除外＝**非表示**へ
 * 撤回。本 state 自体は reason 判定/診断 JSON 用に温存（DO_NOT_REWRITE）。
 *
 * @typedef {'ok' | 'no_event' | 'no_program_gift' | 'iframe_unrendered' | 'fetch_error' | 'not_yet' | 'missing' | 'event_present_unscrapable'} NorthStarLaneState
 */

/**
 * NDGR / bundle が「このイベントに参加している」ことを示す signal を持つか
 * （boolean presence のみ。順位"数値"は使わない＝field6 silence 遵守）。
 * 純関数・副作用なし。bundle / snap が null でも安全。
 *
 * @param {any} bundle
 * @param {any} snap
 * @returns {boolean}
 */
export function hasEventParticipationSignal(bundle, snap) {
  // NDGR field6 由来のイベント存在シグナル（presence のみ、数値非表示）
  if (numOrNull(snap?.officialNicoEventRankNdgr) != null) return true;
  if (numOrNull(snap?.officialEventGiftScoreNdgr) != null) return true;
  if (strNonEmpty(snap?.officialNicoEventTitleNdgr)) return true;
  // bundle 側のイベント痕跡（ok 未満でも「参加はしている」示唆）
  if (bundle?.eventBanner || bundle?.eventBalloon) return true;
  if (strNonEmpty(bundle?.eventCumulativeScoreMirrorHtml)) return true;
  if (strNonEmpty(bundle?.eventCurrentRankMirrorHtml)) return true;
  return false;
}

/**
 * @param {string} laneId popup.html の `data-lane="<laneId>"` に対応。
 *   'contributionRanking' | 'giftHistory' | 'eventScore' | 'programPoints' |
 *   'eventRank' | 'adRanking'
 * @param {{
 *   bundle?: any,
 *   snap?: any
 * }} ctx
 * @returns {NorthStarLaneState}
 */
export function determineNorthStarLaneState(laneId, ctx) {
  const bundle = ctx?.bundle || null;
  const snap = ctx?.snap || null;

  // 起動直後（bundle / snap がどちらも空）→ not_yet
  if (!bundle && !snap) return 'not_yet';

  switch (laneId) {
    case 'contributionRanking': {
      const count = Array.isArray(bundle?.contributionRanking)
        ? bundle.contributionRanking.length
        : 0;
      if (count > 0) return 'ok';
      // gift sidebar cross-origin iframe の Vue mount 不全（v0.1.218〜）
      // 詳細判定は heartbeat 情報があれば iframe_unrendered/fetch_error を分けられるが、
      // popup 側からは bundle/snap しか見えない。簡素化して iframe_unrendered を返す。
      return 'iframe_unrendered';
    }
    case 'giftHistory': {
      const count = Array.isArray(bundle?.giftHistory)
        ? bundle.giftHistory.length
        : 0;
      if (count > 0) return 'ok';
      // programStats.giftPoints が 0 ならギフト 0 件配信
      const gp = bundle?.programStats?.giftPoints;
      if (gp === 0) return 'no_program_gift';
      // NDGR からもギフトポイント 0 確認
      const gpNdgr = snap?.officialGiftPointsNdgr;
      if (gpNdgr === 0) return 'no_program_gift';
      // ギフト発生があるはずなのに取れていない → iframe_unrendered
      return 'iframe_unrendered';
    }
    case 'eventScore': {
      const dom = numOrNull(bundle?.eventBanner?.score);
      const balloon = numOrNull(bundle?.eventBalloon?.eventTotalScore);
      const mirror = strNonEmpty(bundle?.eventCumulativeScoreMirrorHtml);
      const ndgr = numOrNull(snap?.officialEventGiftScoreNdgr);
      if (dom != null || balloon != null || mirror || ndgr != null) return 'ok';
      // v0.1.282: 値は無いが NDGR 等がイベント参加を示す → 参加中・取得困難
      if (hasEventParticipationSignal(bundle, snap)) {
        return 'event_present_unscrapable';
      }
      // banner も balloon も NDGR も無い → イベント不参加
      return 'no_event';
    }
    case 'eventRank': {
      // 鏡 mirrorHtml / banner.rank / 貢献度ランキング DOM のいずれかがあれば ok
      // （貢献度上位は「イベント十位」とは別指標だが、公式レーンで併記するため）。
      // v0.1.241: NDGR field 6 単独は「ギフト欄の現在 N 位」と一致しないことが多いため、
      // ok 判定・ユーザー向け順位表示には使わない（診断 JSON の ndgrValue 参照用に残す）。
      const dom = numOrNull(bundle?.eventBanner?.rank);
      const mirror = strNonEmpty(bundle?.eventCurrentRankMirrorHtml);
      const contribCount = Array.isArray(bundle?.contributionRanking)
        ? bundle.contributionRanking.length
        : 0;
      if (dom != null || mirror || contribCount > 0) return 'ok';
      // v0.1.282: NDGR 等がイベント参加を示す state を返す（reason/診断用）。
      // ⛔ 2026-05-19: この state の「可視表示」は撤回（northStarLaneVisibility
      // で非表示へ）。空 placeholder のスペース浪費をユーザーが却下したため。
      // ※順位"数値"は元々出さない（field6 silence）。state 自体は温存。
      if (hasEventParticipationSignal(bundle, snap)) {
        return 'event_present_unscrapable';
      }
      const gpDom = numOrNull(bundle?.programStats?.giftPoints);
      const gpNdgr = numOrNull(snap?.officialGiftPointsNdgr);
      const gp = gpDom != null ? gpDom : gpNdgr;
      if (gp != null && gp > 0) return 'iframe_unrendered';
      return 'no_event';
    }
    case 'programPoints': {
      const dom = numOrNull(bundle?.programStats?.giftPoints);
      const ndgr = numOrNull(snap?.officialGiftPointsNdgr);
      if (dom != null || ndgr != null) return 'ok';
      // programStats 自体は取れている（オブジェクト存在）が giftPoints が null → ギフト 0 件
      if (bundle?.programStats) return 'no_program_gift';
      return 'not_yet';
    }
    case 'adRanking': {
      const count = Array.isArray(bundle?.adContributionRanking)
        ? bundle.adContributionRanking.length
        : 0;
      const mirror = strNonEmpty(bundle?.adRankingMirrorHtml);
      if (count > 0 || mirror) return 'ok';
      // 広告ランキングは多くの配信で取れる（v0.1.237 実装、nicoad relay）
      // 取れていない場合は配信開始直後 or 取得エラー
      return 'fetch_error';
    }
    default:
      return 'missing';
  }
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function strNonEmpty(v) {
  return typeof v === 'string' && v.length > 0;
}
