/**
 * v0.1.201: gift sub-app DOM の payload を診断 JSON 用 summary に変換する純関数。
 *
 * 既存 `formatGiftSubAppHistory.js#summarizeGiftSubAppHistory` は popup の
 * `<summary>` ラベル用（短い表示テキスト）。本 summary は診断 JSON 統合用で、
 * 「上位 senders / items の sample」「resolved/unresolved sender 集計」「同一
 * origin 内で scrape 可能だった iframe 数」までを含み、AI 共有診断で「ギフト
 * 観測がちゃんと取れているか」を判定できるようにする。
 *
 * 副作用なし。
 *
 * 入力は `nls_gift_subapp_history_<liveId>` payload（content-script の
 * `persistGiftSubAppHistoryNow` が書き込んだ形）。または同等構造の object。
 */

import { deriveGiftSubAppFailureReason } from './diagWarnings.js';

/**
 * sender 名のうち unresolved 扱いするパターン。
 * - 空文字 / null / undefined
 * - 「名無し」「ゲスト」（sub-app DOM に出現する代表的な anonymous label）
 * @type {Set<string>}
 */
const UNRESOLVED_SENDER_NAMES = new Set(['名無し', 'ゲスト']);

/**
 * @typedef {{ name: string, totalPoints: number }} TopSenderEntry
 * @typedef {{ name: string, count: number }} TopItemEntry
 */

/**
 * @typedef {{
 *   historyCount: number,
 *   itemTypeCount: number,
 *   resolvedSenderCount: number,
 *   unresolvedSenderCount: number,
 *   topSenders: TopSenderEntry[],
 *   topItems: TopItemEntry[],
 *   totalPoints: number,
 *   iframeCount: number,
 *   scrapableFrameCount: number,
 *   failureReason: string|null
 * }} GiftSubAppDiagSummary
 */

/**
 * sub-app payload を診断 JSON 用 summary に変換する。
 * 壊れた個別 item があっても落ちず、集計対象から除外する（件数は length で数える）。
 *
 * @param {{
 *   history?: any,
 *   totalCounts?: any,
 *   scannedFrames?: any,
 *   observedFrames?: any
 * } | null | undefined} payload
 * @returns {GiftSubAppDiagSummary}
 */
export function summarizeGiftSubAppHistoryDiag(payload) {
  /** @type {GiftSubAppDiagSummary} */
  const empty = {
    historyCount: 0,
    itemTypeCount: 0,
    resolvedSenderCount: 0,
    unresolvedSenderCount: 0,
    topSenders: [],
    topItems: [],
    totalPoints: 0,
    iframeCount: 0,
    scrapableFrameCount: 0,
    // v0.1.203: empty 状態は iframe が観測できなかった = 'no_iframe_found'
    failureReason: 'no_iframe_found'
  };
  if (!payload || typeof payload !== 'object') return empty;

  const history = Array.isArray(payload.history) ? payload.history : [];
  const totalCounts = Array.isArray(payload.totalCounts) ? payload.totalCounts : [];

  /** @type {Map<string, number>} sender 名 → 累積 totalPoints */
  const senderPointMap = new Map();
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let totalPoints = 0;

  for (const it of history) {
    if (!it || typeof it !== 'object') {
      unresolvedCount += 1;
      continue;
    }
    const rawSender = /** @type {any} */ (it).senderName;
    const senderName =
      typeof rawSender === 'string' ? rawSender.trim() : '';
    const isUnresolved =
      senderName === '' || UNRESOLVED_SENDER_NAMES.has(senderName);
    if (isUnresolved) {
      unresolvedCount += 1;
    } else {
      resolvedCount += 1;
    }

    const rawPts = /** @type {any} */ (it).points;
    const pts = typeof rawPts === 'number' && Number.isFinite(rawPts) ? rawPts : 0;
    if (pts > 0) {
      totalPoints += pts;
      if (senderName) {
        senderPointMap.set(senderName, (senderPointMap.get(senderName) || 0) + pts);
      }
    }
  }

  /** @type {TopSenderEntry[]} */
  const topSenders = [...senderPointMap.entries()]
    .map(([name, totalPoints]) => ({ name, totalPoints }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 5);

  /** @type {Map<string, number>} item 名 → count */
  const itemCountMap = new Map();
  for (const it of totalCounts) {
    if (!it || typeof it !== 'object') continue;
    const rawName = /** @type {any} */ (it).itemName;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) continue;
    const rawCount = /** @type {any} */ (it).count;
    const count =
      typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : 0;
    if (count <= 0) continue;
    itemCountMap.set(name, (itemCountMap.get(name) || 0) + count);
  }

  /** @type {TopItemEntry[]} */
  const topItems = [...itemCountMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const scannedFrames =
    typeof payload.scannedFrames === 'number' && Number.isFinite(payload.scannedFrames)
      ? Math.max(0, payload.scannedFrames | 0)
      : 0;
  const observedFrames =
    typeof payload.observedFrames === 'number' && Number.isFinite(payload.observedFrames)
      ? Math.max(0, payload.observedFrames | 0)
      : 0;

  const result = {
    historyCount: history.length,
    itemTypeCount: itemCountMap.size,
    resolvedSenderCount: resolvedCount,
    unresolvedSenderCount: unresolvedCount,
    topSenders,
    topItems,
    totalPoints,
    iframeCount: scannedFrames,
    scrapableFrameCount: observedFrames
  };
  // v0.1.203: 取得失敗の理由を 1 トークンで diag に含める
  // （Agent A deep research: cross-origin iframe は仕様、NDGR 経路に頼る必要）
  return {
    ...result,
    failureReason: deriveGiftSubAppFailureReason(result)
  };
}
