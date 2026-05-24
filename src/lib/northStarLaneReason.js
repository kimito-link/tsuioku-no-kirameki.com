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
 * v0.1.359: 「このイベントに**確実に参加している**」と言い切れる公式 DOM 由来の
 * 証拠だけを判定する厳格版（表示ゲート専用）。
 *
 * 経緯: NDGR statistics の rank/score/title は、ギフトイベント不参加の配信でも
 * 別文脈の値が乗ることがあり（実機: 非イベント配信で「現在 N 位」「スコア 72」/
 * 文字化けタイトルが誤表示）、`hasEventParticipationSignal` のような NDGR を含む
 * 緩い判定を表示可否に使うと誤表示が出る。表示は公式 watch ページ DOM の確かな
 * 証拠が在るときだけに限る（ユーザー要望「参加してない時は出さない」）。
 *
 * 採用する証拠（いずれも実イベント UI 由来で narrow）:
 *  - eventBanner: 「○○さんが参加しています！」グリーンバナー（owner-name テキストで識別）。
 *  - eventBalloon.eventTotalScore: ギフト欄の「イベント累計スコア」ラベル限定。
 *    （`番組累計ポイント` は非イベントでも出るので eventBalloon の存在だけでは採らない）
 *  - eventCumulativeScoreMirrorHtml / eventCurrentRankMirrorHtml: audition embed
 *    （実イベント UI）由来の鏡 HTML。これらは eventBanner と同時にのみセットされる。
 *
 * NDGR 値はこの判定に**含めない**。NDGR は「目安」補助として、この判定が true の
 * ときに限り別途添えてよい。
 *
 * @param {any} bundle
 * @returns {boolean}
 */
export function officialEventConfirmedFromDom(bundle) {
  if (!bundle || typeof bundle !== 'object') return false;
  if (bundle.eventBanner) return true;
  if (numOrNull(bundle?.eventBalloon?.eventTotalScore) != null) return true;
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
      // v0.1.359: 公式 DOM 証拠が無い時は ok にしない（NDGR score 単独で「72」等を
      //   非イベント配信に誤表示していたのを根絶）。表示は公式イベント UI 由来のみ。
      if (!officialEventConfirmedFromDom(bundle)) return 'no_event';
      const dom = numOrNull(bundle?.eventBanner?.score);
      const balloon = numOrNull(bundle?.eventBalloon?.eventTotalScore);
      const mirror = strNonEmpty(bundle?.eventCumulativeScoreMirrorHtml);
      const ndgr = numOrNull(snap?.officialEventGiftScoreNdgr);
      // 参加確証ありで具体値が在る → ok（NDGR は補助として可）。
      if (dom != null || balloon != null || mirror || ndgr != null) return 'ok';
      // 参加確証はあるが具体スコアが取れていない → 参加中・取得困難
      return 'event_present_unscrapable';
    }
    case 'eventRank': {
      // v0.1.359: 表示は公式 DOM 証拠（banner / balloon の event 累計 / 鏡 HTML）が
      //   在る時だけ。NDGR rank/title/score 単独では「参加」と見なさない（実機:
      //   非イベント配信で NDGR rank/score が乗り「現在 N 位」を誤表示。
      //   feedback_ndgr_field6_silence に完全回帰）。
      if (!officialEventConfirmedFromDom(bundle)) {
        // 参加確証は無いが、ギフトはある配信ならランキングは contributionRanking 側。
        // ここ（eventRank）は「イベント不参加」を明示し空けない。
        return 'no_event';
      }
      const dom = numOrNull(bundle?.eventBanner?.rank);
      const mirror = strNonEmpty(bundle?.eventCurrentRankMirrorHtml);
      const ndgr = numOrNull(snap?.officialNicoEventRankNdgr);
      // DOM banner rank / 鏡 HTML は配信者本人の順位が確証できるので ok。
      if (dom != null || mirror) return 'ok';
      // 参加確証ありで NDGR rank も在る → 「目安」付きで ok（補助表示）。
      if (ndgr != null && ndgr > 0) return 'ok';
      // 参加はしているが順位が取れていない。
      return 'event_present_unscrapable';
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
