/**
 * v0.1.231: iframe relay (NLS_GIFT_HISTORY_FROM_IFRAME) 受信時の
 * 「nls_iframe_official_dom_<lid>」storage 書き込み内容を決める純関数。
 *
 * 経緯:
 *   v0.1.226 → v0.1.230 で iframe relay 受信側の routing 仕様が成熟したが、
 *   実装は content-entry.js の `window.addEventListener('message', ...)`
 *   inline で書かれており、unit test が書きづらかった（chrome.storage と
 *   liveId の global state を要求）。本 lib に「event.data だけから書き込み内容
 *   を決める」純粋関数として切り出すことで、受信ロジックを testable にする。
 *
 *   これにより v0.1.230 で実装した「nicoad iframe の contributionRanking は
 *   信頼しない」「eventBanner は audition iframe のみ信頼」といった routing が、
 *   実機テスト無しで CI 上で回帰検出できるようになる。
 *
 * 副作用なし、純関数。
 */

import {
  classifyGiftSubAppFrameSource,
  isContributionRankingTrustedSource,
  isEventBannerTrustedSource
} from './giftSubAppFrameSource.js';

/**
 * @typedef {{
 *   frameUrl?: string,
 *   contributionRanking?: unknown,
 *   eventBanner?: unknown
 * }} IframeRelayEventData
 */

/**
 * @typedef {{
 *   contributionRanking: Array<unknown>,
 *   eventBanner: unknown,
 *   capturedAt: number,
 *   frameUrl: string,
 *   frameSource: import('./giftSubAppFrameSource.js').GiftSubAppFrameSource
 * }} OfficialDomPayload
 */

/**
 * @typedef {{
 *   shouldWrite: boolean,
 *   payload: OfficialDomPayload | null,
 *   frameSource: import('./giftSubAppFrameSource.js').GiftSubAppFrameSource,
 *   reason: 'no-data' | 'no-input' | 'all-dropped' | 'accepted'
 * }} BuildOfficialDomResult
 */

/**
 * relay event の data から `nls_iframe_official_dom_<lid>` 書き込み内容を決める。
 *
 * @param {IframeRelayEventData|null|undefined} eventData
 * @param {{ nowMs?: number }} [options]
 * @returns {BuildOfficialDomResult}
 */
export function buildOfficialDomFromRelayEvent(eventData, options = {}) {
  const now =
    options && typeof options.nowMs === 'number' && Number.isFinite(options.nowMs)
      ? options.nowMs
      : Date.now();

  if (!eventData || typeof eventData !== 'object') {
    return { shouldWrite: false, payload: null, frameSource: 'unknown', reason: 'no-data' };
  }

  const frameUrl = String(eventData.frameUrl || '').slice(0, 200);
  const frameSource = classifyGiftSubAppFrameSource(frameUrl);

  const rawContrib = Array.isArray(eventData.contributionRanking)
    ? /** @type {Array<unknown>} */ (eventData.contributionRanking)
    : null;
  const rawBanner =
    eventData.eventBanner && typeof eventData.eventBanner === 'object'
      ? eventData.eventBanner
      : null;

  // 入力自体が空なら no-input（nicoad で不適合 drop ではない）
  if (!rawContrib && !rawBanner) {
    return { shouldWrite: false, payload: null, frameSource, reason: 'no-data' };
  }
  if ((rawContrib === null || rawContrib.length === 0) && !rawBanner) {
    return { shouldWrite: false, payload: null, frameSource, reason: 'no-input' };
  }

  // v0.1.230 routing: 信頼できる送信元のみ採用
  const contributionRanking = isContributionRankingTrustedSource(frameSource)
    ? rawContrib
    : null;
  const eventBanner = isEventBannerTrustedSource(frameSource) ? rawBanner : null;

  const hasContrib = !!(contributionRanking && contributionRanking.length > 0);
  const hasBanner = !!eventBanner;

  if (!hasContrib && !hasBanner) {
    return { shouldWrite: false, payload: null, frameSource, reason: 'all-dropped' };
  }

  return {
    shouldWrite: true,
    payload: {
      contributionRanking: contributionRanking || [],
      eventBanner: eventBanner || null,
      capturedAt: now,
      frameUrl,
      frameSource
    },
    frameSource,
    reason: 'accepted'
  };
}
