/**
 * watch ページの DOM から「配信者の番組周辺の正本値」を 1 関数で総取りするオーケストレータ。
 * 個別の 4 スクレイパは {@link ./officialEventBannerDom.js} に居る。
 * 結果は `nls_event_dom_<lv>` ストレージへ保存され、popup・HTML レポート・マーケ分析の
 * 三方向から同じ束を読む（1 ソース・多面利用）。
 */

import {
  scrapeOfficialEventBannerFromDom,
  scrapeOfficialEventBalloonFromDom,
  scrapeContributionRankingFromDom,
  scrapeProgramStatisticsMenuFromDom,
  scrapeGiftHistoryFromDom
} from './officialEventBannerDom.js';

/**
 * niconico の audition embed URL を直接 fetch して、HTML 内のバナー情報を掬う。
 * これで watch ページのギフトサイドバーを開かずに event 参加情報が取れる。
 * 同じスクレイパ（scrapeOfficialEventBannerFromDom）を fetch 結果の HTML に対して
 * 流用 — 1 ソース・多面利用。
 *
 * @param {string} liveId 例 'lv350458677'
 * @returns {Promise<ReturnType<typeof scrapeOfficialEventBannerFromDom>>}
 */
export async function fetchOfficialEventBannerFromAuditionEmbed(liveId) {
  const lid = String(liveId || '').trim();
  if (!lid) return null;
  const url =
    'https://audition.nicovideo.jp/embedded/richview/live?content_id=' +
    encodeURIComponent(lid) +
    '&frontend_id=9&frontend_version=644.0.0';
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html) return null;
    if (typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) return null;
    return scrapeOfficialEventBannerFromDom(doc);
  } catch {
    return null;
  }
}

/**
 * @typedef {{
 *   capturedAt: number,
 *   eventBanner: ReturnType<typeof scrapeOfficialEventBannerFromDom>,
 *   eventBalloon: ReturnType<typeof scrapeOfficialEventBalloonFromDom>,
 *   contributionRanking: ReturnType<typeof scrapeContributionRankingFromDom>,
 *   programStats: ReturnType<typeof scrapeProgramStatisticsMenuFromDom>,
 *   giftHistory: ReturnType<typeof scrapeGiftHistoryFromDom>
 * }} OfficialEventDomBundle
 */

/**
 * Document から 4 種すべてを掬って 1 オブジェクトに束ねる。
 * 全部 null（取れなかった）のときは null を返す（保存 skip 用）。
 *
 * @param {Document|Element} root
 * @param {{ nowMs?: number }} [opts]
 * @returns {OfficialEventDomBundle|null}
 */
export function collectOfficialEventDomBundle(root, opts = {}) {
  const nowMs =
    typeof opts?.nowMs === 'number' && Number.isFinite(opts.nowMs) && opts.nowMs > 0
      ? opts.nowMs
      : Date.now();
  const eventBanner = scrapeOfficialEventBannerFromDom(root);
  const eventBalloon = scrapeOfficialEventBalloonFromDom(root);
  const contributionRanking = scrapeContributionRankingFromDom(root);
  const programStats = scrapeProgramStatisticsMenuFromDom(root);
  const giftHistory = scrapeGiftHistoryFromDom(root);
  if (
    !eventBanner &&
    !eventBalloon &&
    !contributionRanking &&
    !programStats &&
    !giftHistory
  ) {
    return null;
  }
  return {
    capturedAt: nowMs,
    eventBanner,
    eventBalloon,
    contributionRanking,
    programStats,
    giftHistory
  };
}

/**
 * 既存 bundle と新 bundle を比較し、新の方に値があるフィールドだけ採用してマージする。
 * （DOM が一時的に閉じられた・モーダルが閉まった等で取れなくなったフィールドを古い値で温存する）
 *
 * @param {OfficialEventDomBundle|null} prev
 * @param {OfficialEventDomBundle|null} next
 * @returns {OfficialEventDomBundle|null}
 */
export function mergeOfficialEventDomBundle(prev, next) {
  if (!prev && !next) return null;
  if (!prev) return next;
  if (!next) return prev;
  return {
    capturedAt: Math.max(prev.capturedAt || 0, next.capturedAt || 0),
    eventBanner: next.eventBanner || prev.eventBanner,
    eventBalloon: next.eventBalloon || prev.eventBalloon,
    contributionRanking: next.contributionRanking || prev.contributionRanking,
    programStats: next.programStats || prev.programStats,
    giftHistory: next.giftHistory || prev.giftHistory
  };
}
