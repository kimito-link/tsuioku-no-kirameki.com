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
 * @typedef {'ok' | 'no_event' | 'no_program_gift' | 'iframe_unrendered' | 'fetch_error' | 'not_yet' | 'missing'} NorthStarLaneState
 */

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
      // banner も balloon も NDGR も無い → イベント不参加
      return 'no_event';
    }
    case 'eventRank': {
      const dom = numOrNull(bundle?.eventBanner?.rank);
      const mirror = strNonEmpty(bundle?.eventCurrentRankMirrorHtml);
      const ndgr = numOrNull(snap?.officialNicoEventRankNdgr);
      if (dom != null || mirror || ndgr != null) return 'ok';
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
