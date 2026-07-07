/**
 * 北極星ギフト履歴レーン用 ViewModel（送り主集計 + 個別投げ一覧）。
 * aggregateGiftSubAppHistoryBySender を土台に表示 HTML を組み立てる。
 */

import { aggregateGiftSubAppHistoryBySender } from './kokenGiftHistoryApi.js';
import {
  buildGiftThrowLedgerTableSectionHtml,
  giftThrowRowFromSubAppHistory
} from './giftThrowLedgerTableHtml.js';

/**
 * @param {{ history?: readonly unknown[], capturedAt?: number, source?: string }|null|undefined} payload
 * @param {{ maxRooms?: number, maxThrows?: number }} [opts]
 */
export function buildGiftHistoryNorthStarViewModel(payload, opts = {}) {
  const agg = aggregateGiftSubAppHistoryBySender(payload, {
    maxRooms: opts.maxRooms ?? 10
  });
  if (!agg || !agg.rooms.length) return null;
  const history = Array.isArray(payload?.history) ? payload.history : [];
  const maxThrows =
    typeof opts.maxThrows === 'number' && opts.maxThrows > 0 ? Math.trunc(opts.maxThrows) : 20;
  const payloadSource = String(payload?.source || 'gift-sub-app').trim();
  const ledgerRows = history
    .slice(0, maxThrows)
    .map((raw) => giftThrowRowFromSubAppHistory(raw, payloadSource))
    .filter((r) => r != null);
  const recentThrows = ledgerRows.map((r) => ({
    senderName: r.senderLabel,
    itemName: r.itemName,
    points: r.points,
    pointsRaw: String(r.points),
    time: r.timeLabel,
    userId: r.userId,
    thumbnailUrl: r.thumbnailUrl,
    senderAvatarUrl: r.senderAvatarUrl
  }));
  return {
    ...agg,
    recentThrows,
    // ③WEB丸写し(第2号・reference_full_mirror_SYNTHESIS.md B2-2): 個別投げ明細の【生データ行】を公開する。
    //   throwsTableHtml(HTML文字列)は R-1 によりサーバー往復の鏡に載せられないため、鏡側はこの
    //   ledgerRows(JSON-safe な giftThrowRow 配列)を運び、③が buildGiftThrowLedgerTableSectionHtml を
    //   自分で呼ぶ。①の描画(recentThrows/throwsTableHtml)は一切変えない(挙動不変)。
    ledgerRows,
    ledgerTotalCount: history.length,
    payloadSource,
    throwsTableHtml: buildGiftHistoryThrowsTableHtml(
      history,
      history.length,
      maxThrows,
      payloadSource
    )
  };
}

/**
 * @param {readonly unknown[]} history
 * @param {number} totalCount
 * @param {number} shownCount
 * @param {string} [payloadSource]
 */
export function buildGiftHistoryThrowsTableHtml(
  history,
  totalCount,
  shownCount,
  payloadSource = ''
) {
  const rows = (Array.isArray(history) ? history : [])
    .slice(0, shownCount)
    .map((raw) => giftThrowRowFromSubAppHistory(raw, payloadSource))
    .filter((r) => r != null);
  if (!rows.length) return '';
  return buildGiftThrowLedgerTableSectionHtml(rows, {
    totalCount,
    shownCount,
    payloadSource
  });
}
