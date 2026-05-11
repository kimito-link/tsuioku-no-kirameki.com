/**
 * v0.1.250: 北極星「鏡のように貼り付け」レーン 1 (貢献度ランキング) 用の outerHTML 取得関数。
 *
 * niconico ギフトサイドバー内に Vue が render する `ul.contribution-ranking-list`
 * （イベント参加時のランカー一覧。広告ランキングとは別 DOM・別 class）を outerHTML
 * 文字列で取り出す純関数。
 *
 * 既存資産との関係:
 * - 同じ DOM は `tryAutoOpenGiftSidebarOnceForScrape` (content-entry.js) の
 *   sidebar 自動オープン → ランキングタブ click → polling パスで親 frame の
 *   `document` 配下に出現する（gift sidebar が同一 origin で render される場合）。
 * - `scrapeAdRankingMirrorHtml` (officialEventBannerDom.js) は **広告ランキング**用
 *   （`.content-supporter-section ul.wrapper`）で本関数とは取得対象が別。
 * - DOM 構造例（kimito さん明示の構造マップ、memory plan_north_star_v0226_ranking_fidelity.md）:
 *     <ul class="contribution-ranking-list">
 *       <li class="ranker">
 *         <button class="button">
 *           <p class="rank"><svg class="rank-icon">...</svg></p>
 *           <p class="text"><span class="ranker-name"><strong class="ranker-name-value">名無し</strong></span>...</p>
 *           <p class="contribution">18,005 <svg class="contribution-unit"><title>貢</title>...</svg></p>
 *         </button>
 *       </li>
 *       ...
 *     </ul>
 *
 * CSS Modules ハッシュ化対策 (Gemini 視点 #17): 完全一致が無いときは部分一致セレクタで
 * fallback。
 *
 * 純関数。副作用なし。null / undefined / DOM 不在は null 返却。
 */

/**
 * @param {Document|HTMLElement|Element|null|undefined} root
 * @returns {string|null} outerHTML 文字列。取れなかった時は null
 */
export function scrapeContributionRankingMirrorHtml(root) {
  if (!root) return null;

  /** @type {Element|null} */
  let list = null;
  try {
    list =
      /** @type {any} */ (root).querySelector?.('ul.contribution-ranking-list') ||
      /** @type {any} */ (root).querySelector?.(
        'ul[class*="contribution-ranking-list"]'
      ) ||
      null;
  } catch {
    return null;
  }

  if (!(list instanceof Element)) return null;

  const html = String(list.outerHTML || '').trim();
  return html || null;
}

/**
 * 観測用ヘルパ。`ul.contribution-ranking-list > li.ranker` の件数を返す。
 * 0 件のときは「サイドバーは描画されているがイベント不参加」の判定に使える。
 *
 * @param {Document|HTMLElement|Element|null|undefined} root
 * @returns {number}
 */
export function countContributionRankingItems(root) {
  if (!root) return 0;
  try {
    // NodeList は空でも truthy なので `||` フォールバックは効かない。length で判定する。
    const exact =
      /** @type {any} */ (root).querySelectorAll?.(
        'ul.contribution-ranking-list > li.ranker'
      ) || null;
    if (exact && exact.length > 0) return exact.length;
    const partial =
      /** @type {any} */ (root).querySelectorAll?.(
        'ul[class*="contribution-ranking-list"] > li[class*="ranker"]'
      ) || null;
    return partial?.length || 0;
  } catch {
    return 0;
  }
}
