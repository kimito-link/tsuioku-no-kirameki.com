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
 * v0.1.851: `no_ranking_data` を追加(council/adlane-fetcherror-SYNTHESIS)。Koken/Nicoad API が
 * 通信成功(ok===true・200)だが該当ランキングが 0 件=「この配信にランキングが無いだけ」を表す。
 * 従来は 0 件も `fetch_error`(取得エラー=赤)と誤称しユーザー/AI を誤誘導していた。`fetch_error` は
 * 以後「本物の取得失敗(ok===false)」専用。健全度パネルは no_ranking_data=na(対象外・灰)。
 *
 * @typedef {'ok' | 'no_event' | 'no_program_gift' | 'iframe_unrendered' | 'fetch_error' | 'not_yet' | 'missing' | 'event_present_unscrapable' | 'no_ranking_data'} NorthStarLaneState
 */

import { classifyLaneResult } from './northStarLaneResult.js';

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
 *   snap?: any,
 *   kokenApiRows?: any[]|null,
 *   nicoadApiRows?: any[]|null,
 *   giftHistoryApiRows?: any[]|null,
 *   contribResult?: { ok: boolean|null, status: number|null, rows: any[]|null }|null,
 *   adResult?: { ok: boolean|null, status: number|null, rows: any[]|null }|null
 * }} ctx
 *   v0.1.617: kokenApiRows / nicoadApiRows は無認証 API 直叩きで storage に入った rows。
 *   取れていれば `ok` を返し、iframe scrape 時代の `iframe_unrendered` / `fetch_error`
 *   (=「公式から問い合わせ中」キャラ案内)を出さない。省略時(undefined)は旧ロジックと完全同一
 *   (bundle のみ参照)＝後方互換。
 *   v0.1.851: contribResult / adResult(makeLaneResult の戻り)が渡されたら、0件フォールバックを
 *   「成功0件=no_ranking_data(該当無し)」「失敗=fetch_error」「未取得=not_yet」に正しく分ける。
 *   省略時は従来の rows のみ経路(等価)＝後方互換。
 *
 *   ★★未解決(2026-08-12 調査で判明・v0.1.1340 時点):
 *     contribResult / adResult を渡しているのは content-entry.js:6782-6789 だけ。
 *     **popup 経路(popup-entry.js の3レーン)は渡していない＝この分岐が発火しない**。
 *     結果、popup では「API が200で成功したが0件」を fetch_error / iframe_unrendered と
 *     誤称する(v0.1.851 が根治したはずの症状が popup にだけ残っている)。
 *     ★ただし単純な配線漏れ【ではない】: 成否(ok/status)の出所である `_externalFetchProbe`
 *       は content script 側の状態で、**popup にはその情報が存在しない**(grep 0件)。
 *       渡すには「取得の成否を popup まで運ぶ経路」を先に作る必要がある＝別版の仕事。
 *     ★暫定で嘘の値を渡さないこと(成功と誤判定すると本物の失敗を隠す)。
 * @returns {NorthStarLaneState}
 */
export function determineNorthStarLaneState(laneId, ctx) {
  const bundle = ctx?.bundle || null;
  const snap = ctx?.snap || null;
  const kokenApiRows = Array.isArray(ctx?.kokenApiRows) ? ctx.kokenApiRows : null;
  const nicoadApiRows = Array.isArray(ctx?.nicoadApiRows) ? ctx.nicoadApiRows : null;
  /*
   * ★v0.1.1339: giftHistory の API 直読み経路(kokenApiRows/nicoadApiRows と同じ流儀)。
   *
   * ★このとき呼び出し側にも【2件の片肺】が見つかったので併記する(popup-entry.js):
   *   - giftHistory: この引数自体が無く、判定は公式DOMしか見られなかった
   *   - contributionRanking: v0.1.617 で kokenApiRows の分岐を足したのに、
   *     呼び出し側が { bundle, snap } しか渡しておらず【一度も発火していなかった】
   *   ＝3レーン中2つで「判定コードはあるが配線が無い」状態だった。
   *   検査: src/extension/giftHistoryLaneStateWiring.test.js が3レーン全部を断言する。
   */
  const giftHistoryApiRows = Array.isArray(ctx?.giftHistoryApiRows) ? ctx.giftHistoryApiRows : null;
  const contribResult = ctx?.contribResult || null;
  const adResult = ctx?.adResult || null;

  // 起動直後（bundle / snap がどちらも空）→ not_yet
  if (!bundle && !snap) return 'not_yet';

  switch (laneId) {
    case 'contributionRanking': {
      // v0.1.617: koken API 直叩きで取れていれば ok（iframe 時代の問い合わせ中を出さない）。
      if (kokenApiRows && kokenApiRows.length > 0) return 'ok';
      const count = Array.isArray(bundle?.contributionRanking)
        ? bundle.contributionRanking.length
        : 0;
      if (count > 0) return 'ok';
      // v0.1.851: 取得結果(contribResult)があれば 0件フォールバックを正しく分ける。
      //   成功0件=no_ranking_data(該当無し・赤にしない) / 失敗=fetch_error / 未取得=not_yet。
      const cls = classifyLaneResult(contribResult);
      if (cls === 'empty_ok') return 'no_ranking_data';
      if (cls === 'failed') return 'fetch_error';
      if (cls === 'pending') return 'not_yet';
      // result 無し(旧経路): gift sidebar cross-origin iframe の Vue mount 不全（v0.1.218〜）。
      //   詳細判定は heartbeat があれば分けられるが popup からは bundle/snap しか見えない＝従来どおり。
      return 'iframe_unrendered';
    }
    case 'giftHistory': {
      /*
       * ★v0.1.1339: koken API / sub-app 経由で履歴が取れていれば ok(片肺の解消)。
       *
       * ■ 症状(2026-08-12 実機・状態速報)
       *     公式値レーン: ... / ギフト履歴:⏳取得中 / ...
       *   ギフトが実際に投げられ、レーンも投げ一覧も【正しく描けている】のに
       *   速報だけが永久に「取得中」と言い続けていた。
       *
       * ■ 真因: この case が `bundle.giftHistory`(公式サイドバーの DOM scrape)しか
       *   見ておらず、koken API 経路(nls_gift_subapp_history_<lv> 由来)を無視していた。
       *   ★同じ v0.1.617 で contributionRanking には kokenApiRows、adRanking には
       *     nicoadApiRows という API 直読みの分岐が【追加済み】だったのに、
       *     giftHistory だけ取り残されていた＝典型的な片肺。
       *   ＝サイドバーのギフトタブを開いていない配信では、取れていても「取得中」。
       *
       * ★画面は正しい(描画に成功した経路はこの判定に到達しない)。
       *   壊れていたのは【報告】だけ。だが速報が嘘をつくのは誤診の直接の原因になる。
       */
      if (giftHistoryApiRows && giftHistoryApiRows.length > 0) return 'ok';
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
      // v0.1.617: nicoad API 直叩きで取れていれば ok（iframe/relay 時代の fetch_error を出さない）。
      if (nicoadApiRows && nicoadApiRows.length > 0) return 'ok';
      const count = Array.isArray(bundle?.adContributionRanking)
        ? bundle.adContributionRanking.length
        : 0;
      const mirror = strNonEmpty(bundle?.adRankingMirrorHtml);
      if (count > 0 || mirror) return 'ok';
      // v0.1.851: 取得結果(adResult)があれば 0件フォールバックを正しく分ける(根本治療)。
      //   旧実装は「API 0件 && DOM 0」を一律 fetch_error と誤称していた(実機 lv350746231:
      //   nicoadLastOk:true/200 なのに赤)。成功0件=no_ranking_data(該当無し・灰) /
      //   本物の失敗(ok===false)=fetch_error(赤) / 未取得(ok==null)=not_yet。
      const cls = classifyLaneResult(adResult);
      if (cls === 'empty_ok') return 'no_ranking_data';
      if (cls === 'failed') return 'fetch_error';
      if (cls === 'pending') return 'not_yet';
      // result 無し(旧経路・後方互換): 広告ランキングは多くの配信で取れる（v0.1.237 nicoad relay）。
      //   取れていない=配信開始直後 or 取得エラー＝従来どおり fetch_error。
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
