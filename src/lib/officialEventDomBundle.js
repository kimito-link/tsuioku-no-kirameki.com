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
  scrapeGiftHistoryFromDom,
  scrapeAdContributionRankingRowsAndMirrorFromDom,
  scrapeEventInfoMirrorParts
} from './officialEventBannerDom.js';

/**
 * niconico の audition embed URL を直接 fetch して、HTML 内のバナー情報を掬う。
 * これで watch ページのギフトサイドバーを開かずに event 参加情報が取れる。
 * 同じスクレイパ（scrapeOfficialEventBannerFromDom）を fetch 結果の HTML に対して
 * 流用 — 1 ソース・多面利用。
 *
 * v0.1.240: 戻り値（banner data）に **非列挙の `mirrorParts`** を `Object.defineProperty`
 * で添付（北極星「鏡のように貼り付け」レーン 3 / 5 用）。`mirrorParts` は
 * `{scoreHtml: string|null, rankHtml: string|null}` 形式で、それぞれバナー内の
 * `<span class="score">` / `<span class="rank-field">` の outerHTML。
 * JSON.stringify では落ちるので、storage 保存時は呼び出し側で別 field
 * （`eventCumulativeScoreMirrorHtml` / `eventCurrentRankMirrorHtml`）に明示的に写す
 * （content-entry.js 側の運用）。
 *
 * @param {string} liveId 例 'lv350458677'
 * @returns {Promise<OfficialEventBannerFetchResult|null>}
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
    const banner = scrapeOfficialEventBannerFromDom(doc);
    if (!banner) return null;
    const mirrorParts = scrapeEventInfoMirrorParts(doc);
    if (mirrorParts) {
      Object.defineProperty(banner, 'mirrorParts', {
        value: mirrorParts,
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
    return /** @type {OfficialEventBannerFetchResult} */ (banner);
  } catch {
    return null;
  }
}

/**
 * @typedef {ReturnType<typeof scrapeOfficialEventBannerFromDom> & {
 *   mirrorParts?: {scoreHtml: string|null, rankHtml: string|null}
 * }} OfficialEventBannerFetchResult
 */

/**
 * ニコニ広告ページ（https://nicoad.nicovideo.jp/live/publish/<liveId>?frontend_id=9）
 * を直接 fetch し、その HTML 内の「貢献度ランキング」（広告 pt 順）を scrape する。
 * 同じ `scrapeContributionRankingFromDom` を流用（実 DOM が `.content-supporter-section`
 * 構造で一致するため）。0.1.169 で追加。
 *
 * v0.1.237: 戻り値の Array に **非列挙の `mirrorHtml`** を `Object.defineProperty`
 * で添付（北極星「鏡のように貼り付け」用）。既存の `Array.isArray()` 判定や
 * `.length` / `.map()` 等は影響なく動作する。JSON.stringify では `mirrorHtml` は
 * 落ちるので、storage 保存時には呼び出し側で別 field に明示的に写す（content-entry.js
 * 側で `bundle.adRankingMirrorHtml` に取り出す運用）。
 *
 * @param {string} liveId 例 'lv350459157'
 * @returns {Promise<(any[] & { mirrorHtml?: string|null })|null>}
 *   行が取れなくても `mirrorHtml` が取れれば空配列 + 非列挙 `mirrorHtml` を返す。
 */
export async function fetchNicoadContributionRankingFromPublishPage(liveId) {
  const lid = String(liveId || '').trim();
  if (!lid) return null;
  const url =
    'https://nicoad.nicovideo.jp/live/publish/' +
    encodeURIComponent(lid) +
    '?frontend_id=9';
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html) return null;
    if (typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) return null;

    const { ranking: rankingParsed, mirrorHtml } =
      scrapeAdContributionRankingRowsAndMirrorFromDom(doc);
    /** @type {any[]} */
    const rows = Array.isArray(rankingParsed) ? rankingParsed : [];
    if (rows.length === 0 && !mirrorHtml) {
      return null;
    }
    Object.defineProperty(rows, 'mirrorHtml', {
      value: mirrorHtml,
      writable: false,
      configurable: true,
      enumerable: false
    });
    return /** @type {any[] & { mirrorHtml?: string|null }} */ (rows);
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
 *   adContributionRanking: ReturnType<typeof scrapeContributionRankingFromDom>,
 *   adRankingMirrorHtml: string|null,
 *   eventCumulativeScoreMirrorHtml: string|null,
 *   eventCurrentRankMirrorHtml: string|null,
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
    adContributionRanking: null,
    adRankingMirrorHtml: null,
    eventCumulativeScoreMirrorHtml: null,
    eventCurrentRankMirrorHtml: null,
    programStats,
    giftHistory
  };
}

/**
 * `scrapeGiftHistoryFromDom` の複数回観測を束ねる。仮想リストで `next` が部分集合でも
 * `prev` の行を落とさない（next 優先・重複キーは next を採用）。
 *
 * @param {readonly import('./officialEventBannerDom.js').GiftHistoryEntry[]|null|undefined} prev
 * @param {readonly import('./officialEventBannerDom.js').GiftHistoryEntry[]|null|undefined} next
 * @returns {import('./officialEventBannerDom.js').GiftHistoryEntry[]|null}
 */
export function mergeGiftHistoryDomScrapeArrays(prev, next) {
  const p = Array.isArray(prev) && prev.length > 0 ? prev : null;
  const n = Array.isArray(next) && next.length > 0 ? next : null;
  if (!n) return p ? [...p] : null;
  if (!p) return [...n];
  /** @param {import('./officialEventBannerDom.js').GiftHistoryEntry} e */
  const key = (e) =>
    `${String(e.time).trim()}\t${String(e.advertiserName).trim()}\t${Number(e.point)}\t${String(e.giftName).trim()}`;
  const seen = new Set(n.map((e) => key(e)));
  /** @type {import('./officialEventBannerDom.js').GiftHistoryEntry[]} */
  const merged = [...n];
  for (const e of p) {
    const k = key(e);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(e);
    }
  }
  return merged;
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
    adContributionRanking:
      Array.isArray(next.adContributionRanking) && next.adContributionRanking.length > 0
        ? next.adContributionRanking
        : Array.isArray(prev.adContributionRanking) && prev.adContributionRanking.length > 0
          ? prev.adContributionRanking
          : null,
    adRankingMirrorHtml:
      next.adRankingMirrorHtml || prev.adRankingMirrorHtml || null,
    eventCumulativeScoreMirrorHtml:
      next.eventCumulativeScoreMirrorHtml ||
      prev.eventCumulativeScoreMirrorHtml ||
      null,
    eventCurrentRankMirrorHtml:
      next.eventCurrentRankMirrorHtml ||
      prev.eventCurrentRankMirrorHtml ||
      null,
    programStats: next.programStats || prev.programStats,
    giftHistory: mergeGiftHistoryDomScrapeArrays(prev.giftHistory, next.giftHistory)
  };
}
