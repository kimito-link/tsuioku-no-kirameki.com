/**
 * v0.1.200: ニコ生 watch ページ内「おすすめ生放送」セクションの観測純関数。
 *
 * 診断 JSON に格納する観測値を返す:
 *   - detectedInWatchPage: おすすめ列が watch ページに見えているか
 *   - cardCount: カード（program-card）の件数
 *   - commentCountElementCount: 「コメント数」表示要素（汚染源候補）の件数
 *   - excludedFromScrapeCount: scraper 側で除外した件数（呼び出し側からセット）
 *   - classSamples: 観測した CSS Modules class 名の sample（最大 5 件）
 *
 * 真因確定（v0.1.200）:
 *   `comment-count` クラスがついた要素が拡張の comment scraper に誤 hit
 *   していた。本観測でその数を可視化することで、再発時の検知が可能になる。
 *
 * @typedef {{
 *   detectedInWatchPage: boolean,
 *   cardCount: number,
 *   commentCountElementCount: number,
 *   excludedFromScrapeCount: number,
 *   classSamples: string[]
 * }} RecommendedLiveSectionDiag
 *
 * @param {Document|null|undefined} doc
 * @returns {RecommendedLiveSectionDiag}
 */
export function probeRecommendedLiveSection(doc) {
  /** @type {RecommendedLiveSectionDiag} */
  const empty = {
    detectedInWatchPage: false,
    cardCount: 0,
    commentCountElementCount: 0,
    excludedFromScrapeCount: 0,
    classSamples: []
  };
  if (!doc || typeof (/** @type {any} */ (doc).querySelectorAll) !== 'function') {
    return empty;
  }

  /** @type {string[]} */
  const classSamples = [];
  let cardCount = 0;
  let commentCountElementCount = 0;
  let detectedInWatchPage = false;

  /** @param {string} sel */
  const safeQAll = (sel) => {
    try {
      return /** @type {Document} */ (doc).querySelectorAll(sel);
    } catch {
      return /** @type {NodeListOf<Element>} */ (
        /** @type {unknown} */ ([])
      );
    }
  };

  // 親コンテナの存在で「おすすめ列あり」を判定
  try {
    const list = /** @type {Document} */ (doc).querySelector(
      '[class*="program-card-list"]'
    );
    if (list) detectedInWatchPage = true;
  } catch {
    // ignore
  }

  // カード数（CSS Modules 部分一致）
  const cards = safeQAll('[class*="program-card"]');
  cardCount = (cards.length ?? 0) | 0;
  // li.program-card-list 自体も hit しないよう、article のみカウント直す
  let articleCount = 0;
  try {
    for (const c of cards) {
      const tn = String(/** @type {Element} */ (c).tagName || '').toLowerCase();
      if (tn === 'article') articleCount += 1;
    }
  } catch {
    // ignore
  }
  if (articleCount > 0) cardCount = articleCount;

  // 「コメント数」表示要素（汚染源候補）
  const commentCountElems = safeQAll('[class*="comment-count"]');
  commentCountElementCount = (commentCountElems.length ?? 0) | 0;

  // class 名 sample（CSS Modules ハッシュの実体確認用）。最大 5 件
  try {
    const collected = new Set();
    for (const el of cards) {
      const cls = String(/** @type {Element} */ (el).className || '').trim();
      if (cls) collected.add(cls);
      if (collected.size >= 5) break;
    }
    classSamples.push(...[...collected].slice(0, 5));
  } catch {
    // ignore
  }

  return {
    detectedInWatchPage,
    cardCount,
    commentCountElementCount,
    excludedFromScrapeCount: 0,
    classSamples
  };
}
