/**
 * v0.1.201: ニコ生 watch ページ主要 DOM の存在を観測する純関数。
 *
 * v0.1.200 の `probeRecommendedLiveSection`（おすすめ列）と組み合わせて、
 * 診断 JSON `domStructureProbe` ブロックに格納する。「DOM が見えているのに
 * 集計が空」なのか「そもそも DOM 自体が見えていない」のかをユーザー側で
 * 一目で判断できるようにすることが目的。
 *
 * 観測するもの：
 *   - giftSidebar:
 *       - iframeFound: ページに任意の iframe が 1 つ以上存在するか
 *       - giftHistoryListPresent: ul.gift-history-list が見えるか
 *       - totalDoldCountListPresent: ul.total-dold-count-list が見えるか
 *       - advertiserNameCount: .advertiser-name 要素数
 *   - watchTab:
 *       - commentTablePresent: コメントテーブル DOM の存在
 *       - commentTableRowCount: data-comment-type 属性付き row の数
 *       - videoElementPresent: <video> 要素の存在
 *
 * CSS Modules ハッシュ命名（___gift-history-list___HASH 等）に追随するため、
 * すべて `[class*="..."]` 部分一致併設。
 *
 * 副作用なし。document を読むだけ。
 */

/**
 * @typedef {{
 *   iframeFound: boolean,
 *   giftHistoryListPresent: boolean,
 *   totalDoldCountListPresent: boolean,
 *   advertiserNameCount: number
 * }} GiftSidebarProbe
 *
 * @typedef {{
 *   commentTablePresent: boolean,
 *   commentTableRowCount: number,
 *   videoElementPresent: boolean
 * }} WatchTabProbe
 *
 * @typedef {{
 *   giftSidebar: GiftSidebarProbe,
 *   watchTab: WatchTabProbe
 * }} WatchPageDomStructureProbe
 */

/**
 * @param {Document|null|undefined} doc
 * @returns {WatchPageDomStructureProbe}
 */
export function probeWatchPageDomStructure(doc) {
  /** @type {WatchPageDomStructureProbe} */
  const empty = {
    giftSidebar: {
      iframeFound: false,
      giftHistoryListPresent: false,
      totalDoldCountListPresent: false,
      advertiserNameCount: 0
    },
    watchTab: {
      commentTablePresent: false,
      commentTableRowCount: 0,
      videoElementPresent: false
    }
  };
  if (!doc || typeof (/** @type {any} */ (doc).querySelector) !== 'function') {
    return empty;
  }

  /** @param {string} sel @returns {Element|null} */
  const safeQ = (sel) => {
    try {
      return /** @type {any} */ (doc).querySelector(sel);
    } catch {
      return null;
    }
  };
  /** @param {string} sel @returns {NodeListOf<Element>|Element[]} */
  const safeQAll = (sel) => {
    try {
      return /** @type {any} */ (doc).querySelectorAll(sel);
    } catch {
      return /** @type {any} */ ([]);
    }
  };

  // gift sub-app は iframe で読まれる場合と top document に直接ある場合があるので、
  // どちらでも検出できるよう class*= で部分一致を併用する。
  const iframe = safeQ('iframe');
  const giftHistoryList =
    safeQ('ul.gift-history-list') || safeQ('ul[class*="gift-history-list"]');
  const totalDoldCountList =
    safeQ('ul.total-dold-count-list') ||
    safeQ('ul[class*="total-dold-count-list"]');
  const advertiserNameNodes = safeQAll(
    '.advertiser-name, [class*="advertiser-name"]'
  );

  // watch tab
  const commentTable =
    safeQ('.comment-table') || safeQ('[class*="comment-table"]');
  const commentRows = safeQAll('[data-comment-type]');
  const videoEl = safeQ('video');

  return {
    giftSidebar: {
      iframeFound: !!iframe,
      giftHistoryListPresent: !!giftHistoryList,
      totalDoldCountListPresent: !!totalDoldCountList,
      advertiserNameCount: (advertiserNameNodes.length ?? 0) | 0
    },
    watchTab: {
      commentTablePresent: !!commentTable,
      commentTableRowCount: (commentRows.length ?? 0) | 0,
      videoElementPresent: !!videoEl
    }
  };
}
