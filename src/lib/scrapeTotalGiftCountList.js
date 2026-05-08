/**
 * niconico ギフト sub-app の `total-dold-count-list` から種類別集計を抽出する純関数（v0.1.198）。
 *
 * 2026-05-06 ユーザー提供の lv350468795 実 HTML 構造に基づき確定した DOM フォーマット：
 *
 *   <ul class="total-dold-count-list">
 *     <li class="item">
 *       <img class="thumbnail" src=".../decocome_kawaii_100.png" alt="かわいい×100">
 *       × <strong class="count">1</strong>
 *     </li>
 *     ... 33 種類
 *   </ul>
 *
 * 「アイテム種類別の合計数」を popup に表示するため、
 * シンプルに { itemName, thumbnailUrl, count } の配列を返す。
 *
 * 純関数。副作用なし。
 */

/**
 * @typedef {{ itemName: string, thumbnailUrl: string, count: number }} TotalGiftCountItem
 */

/**
 * @typedef {{ items: TotalGiftCountItem[] }} TotalGiftCountListResult
 */

/**
 * @param {Document|HTMLElement|Element|null|undefined} root
 * @returns {TotalGiftCountListResult}
 */
export function scrapeTotalGiftCountList(root) {
  if (!root) return { items: [] };

  /** @type {Element|null} */
  let list = null;
  try {
    list =
      /** @type {any} */ (root).querySelector?.('ul.total-dold-count-list') ||
      /** @type {any} */ (root).querySelector?.('ul[class*="total-dold-count-list"]') ||
      null;
  } catch {
    return { items: [] };
  }
  if (!list) return { items: [] };

  /** @type {NodeListOf<Element>|Element[]} */
  let lis;
  try {
    lis =
      /** @type {any} */ (list).querySelectorAll?.(':scope > li.item') ||
      /** @type {any} */ (list).querySelectorAll?.(':scope > li[class*="item"]:not([class*="items"])') ||
      [];
    if (!lis || lis.length === 0) {
      lis =
        /** @type {any} */ (list).querySelectorAll?.('li.item, li[class*="item"]:not([class*="items"])') ||
        [];
    }
  } catch {
    return { items: [] };
  }

  /** @type {TotalGiftCountItem[]} */
  const items = [];
  for (const li of /** @type {Iterable<Element>} */ (lis)) {
    const item = extractTotalGiftCountItem(li);
    if (item) items.push(item);
  }

  return { items };
}

/**
 * 単一 li.item から TotalGiftCountItem を抽出。値が揃っていなければ null。
 *
 * @param {Element} li
 * @returns {TotalGiftCountItem|null}
 */
function extractTotalGiftCountItem(li) {
  if (!li || typeof li.querySelector !== 'function') return null;
  const img =
    li.querySelector('img.thumbnail') ||
    li.querySelector('img[class*="thumbnail"]');
  const countEl =
    li.querySelector('strong.count') ||
    li.querySelector('strong[class*="count"]') ||
    li.querySelector('[class*="count"]:not([class*="counts"])');

  if (!img || !countEl) return null;

  const itemName = String(img.getAttribute('alt') || '').trim();
  const thumbnailUrl = String(img.getAttribute('src') || '').trim();
  if (!itemName) return null;

  const countText = String(countEl.textContent || '').trim();
  const countMatch = countText.match(/[\d,]+/);
  if (!countMatch) return null;
  const count = parseInt(countMatch[0].replace(/,/g, ''), 10);
  if (!Number.isFinite(count) || count <= 0) return null;

  return { itemName, thumbnailUrl, count };
}
