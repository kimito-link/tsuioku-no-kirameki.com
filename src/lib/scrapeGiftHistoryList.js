/**
 * niconico ギフト sub-app の `gift-history-list` から個別ギフトを抽出する純関数（v0.1.198）。
 *
 * 2026-05-06 ユーザー提供の lv350468795 実 HTML 構造に基づいて確定した DOM フォーマット：
 *
 *   <ul class="gift-history-list">
 *     <li class="item">
 *       <img class="thumbnail" src=".../decocome_kawaii_100.png" alt="かわいい×100">
 *       <p class="time">4:16:01</p>
 *       <p class="text">
 *         <span class="advertiser-name">quest <small class="honorific">さん</small></span>
 *       </p>
 *       <p class="point">9,000 <small class="point-unit">pt</small></p>
 *     </li>
 *     ... 60+ 件
 *   </ul>
 *
 * 関連：既存の {@link ./officialEventBannerDom.js#scrapeGiftHistoryFromDom} は watch ページの
 * top document を対象にしていた。本関数は「ギフト sub-app DOM」（iframe 内 / 同一 origin）を
 * 対象にし、popup 表示のために itemName / senderName / points を直接的なフィールド名で返す。
 *
 * 純関数。副作用なし。
 */

/**
 * @typedef {{
 *   itemName: string,
 *   thumbnailUrl: string,
 *   time: string,
 *   senderName: string,
 *   points: number,
 *   pointsRaw: string,
 *   senderAvatarUrl: string
 * }} GiftHistoryItem
 */

/**
 * 同一 `li.item` 内の複数 img から、ニコ生ユーザーアイコン URL と思われる src を拾う。
 * `.thumbnail` はギフト画像のことが多いため、`nicoaccount/usericon` で識別する。
 *
 * @param {Element} li
 * @returns {string}
 */
export function pickAdvertiserAvatarUrlFromGiftHistoryLi(li) {
  if (!li || typeof li.querySelectorAll !== 'function') return '';
  try {
    for (const img of li.querySelectorAll('img')) {
      if (!(img instanceof HTMLImageElement)) continue;
      const src = String(img.src || img.getAttribute('src') || '').trim();
      if (!src) continue;
      if (/nicoaccount\/usericon/i.test(src)) return src;
    }
  } catch {
    /* no-op */
  }
  return '';
}

/**
 * ギフト行の「ギフト画像」img。`.thumbnail` が無い改修 DOM では、user icon 以外の
 * 最初の img をフォールバックする（user icon のみの行は null → pt/送り主だけ拾う）。
 *
 * @param {Element} li
 * @returns {HTMLImageElement|null}
 */
export function resolveGiftHistoryGiftImageEl(li) {
  if (!li || typeof li.querySelector !== 'function') return null;
  const direct =
    li.querySelector('img.thumbnail') ||
    li.querySelector('img[class*="thumbnail"]');
  if (direct instanceof HTMLImageElement) return direct;
  try {
    for (const im of li.querySelectorAll('img')) {
      if (!(im instanceof HTMLImageElement)) continue;
      const src = String(im.src || im.getAttribute('src') || '').trim();
      if (src && !/nicoaccount\/usericon/i.test(src)) return im;
    }
  } catch {
    /* no-op */
  }
  return null;
}

/**
 * @typedef {{ items: GiftHistoryItem[], totalCount: number }} GiftHistoryListResult
 */

/**
 * @param {Document|HTMLElement|Element|null|undefined} root
 * @returns {GiftHistoryListResult}
 */
export function scrapeGiftHistoryList(root) {
  if (!root) return { items: [], totalCount: 0 };

  // class 名は CSS Modules ハッシュ化されるので部分一致 fallback
  /** @type {Element|null} */
  let list = null;
  try {
    list =
      /** @type {any} */ (root).querySelector?.('ul.gift-history-list') ||
      /** @type {any} */ (root).querySelector?.('ul[class*="gift-history-list"]') ||
      null;
  } catch {
    return { items: [], totalCount: 0 };
  }
  if (!list) return { items: [], totalCount: 0 };

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
    return { items: [], totalCount: 0 };
  }

  /** @type {GiftHistoryItem[]} */
  const items = [];
  for (const li of /** @type {Iterable<Element>} */ (lis)) {
    const item = extractGiftHistoryItem(li);
    if (item) items.push(item);
  }

  return { items, totalCount: items.length };
}

/**
 * 単一 li.item から GiftHistoryItem を抽出。値が揃っていなければ null。
 *
 * @param {Element} li
 * @returns {GiftHistoryItem|null}
 */
function extractGiftHistoryItem(li) {
  if (!li || typeof li.querySelector !== 'function') return null;
  const img = resolveGiftHistoryGiftImageEl(li);
  const timeEl =
    li.querySelector('p.time') ||
    li.querySelector('p[class*="time"]') ||
    li.querySelector('[class*="time"]:not([class*="point-unit"])');
  const senderEl =
    li.querySelector('.advertiser-name') ||
    li.querySelector('[class*="advertiser-name"]');
  const pointEl =
    li.querySelector('p.point') ||
    li.querySelector('p[class*="point"]:not([class*="point-unit"])') ||
    li.querySelector('[class*="point"]:not([class*="point-unit"])');

  if (!senderEl || !pointEl) return null;

  const itemName =
    img instanceof HTMLImageElement
      ? String(img.getAttribute('alt') || '').trim()
      : '';
  const thumbnailUrl =
    img instanceof HTMLImageElement
      ? String(img.getAttribute('src') || '').trim()
      : '';
  const time = String(timeEl?.textContent || '').trim();

  // sender からは <small class="honorific">さん</small> を除いてテキストを取る
  const senderClone = senderEl.cloneNode(true);
  if (senderClone instanceof HTMLElement) {
    const honorific =
      senderClone.querySelector('.honorific') ||
      senderClone.querySelector('[class*="honorific"]');
    if (honorific) honorific.remove();
  }
  const senderName = String(
    senderClone instanceof HTMLElement ? senderClone.textContent || '' : ''
  ).trim();
  if (!senderName) return null;

  // point の textContent は "9,000\n pt" 形式、最初の数字部分（comma 含む）だけ
  const pointClone = pointEl.cloneNode(true);
  if (pointClone instanceof HTMLElement) {
    const unit =
      pointClone.querySelector('.point-unit') ||
      pointClone.querySelector('[class*="point-unit"]');
    if (unit) unit.remove();
  }
  const pointText = String(
    pointClone instanceof HTMLElement ? pointClone.textContent || '' : ''
  ).trim();
  const pointsMatch = pointText.match(/[\d,]+/);
  if (!pointsMatch) return null;
  const pointsRaw = pointsMatch[0];
  const points = parseInt(pointsRaw.replace(/,/g, ''), 10);
  if (!Number.isFinite(points) || points <= 0) return null;

  const senderAvatarUrl = pickAdvertiserAvatarUrlFromGiftHistoryLi(li);
  return { itemName, thumbnailUrl, time, senderName, points, pointsRaw, senderAvatarUrl };
}
