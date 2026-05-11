/**
 * v0.1.251: 北極星「鏡のように貼り付け」レーン 2 (この番組へのギフト履歴) 用の outerHTML 取得関数。
 *
 * niconico ギフトサイドバー「履歴」タブが active のときに DOM に出現する
 * `ul.gift-history-list` を outerHTML 文字列で取り出す純関数。
 *
 * 既存資産との関係:
 * - `scrapeGiftHistoryFromDom` (officialEventBannerDom.js) は同じ DOM を構造化済の
 *   `GiftHistoryEntry[]` として返す。本関数は **outerHTML 文字列**で返す（鏡レンダリング用）。
 * - `scrapeGiftHistoryList` (scrapeGiftHistoryList.js) は popup 表示用の itemName / senderName /
 *   points を返す。本関数は popup 側 sanitize 経由で鏡として innerHTML 流し込む用途。
 *
 * DOM 構造例 (memory plan_north_star_v0226_ranking_fidelity.md より):
 *     <ul class="gift-history-list">
 *       <li class="item">
 *         <img class="thumbnail" src="..." alt="ギフト名">
 *         <p class="time">3:36:23</p>
 *         <p class="text">
 *           <span class="advertiser-name">名無し <small class="honorific">さん</small></span>
 *         </p>
 *         <p class="point">5 <small class="point-unit">pt</small></p>
 *       </li>
 *       ...
 *     </ul>
 *
 * 取得元: gift sidebar > 「履歴」タブ。autoOpen ロジックは Phase 1 (ランキングタブ) と
 * 別ルート（v0.1.251 で `tryOnDemandFetchGiftHistoryMirrorOnce` を新設）。
 *
 * CSS Modules ハッシュ化対策: 完全一致が無いときは部分一致セレクタで fallback。
 *
 * 純関数。副作用なし。null / undefined / DOM 不在は null 返却。
 */

/**
 * @param {Document|HTMLElement|Element|null|undefined} root
 * @returns {string|null} outerHTML 文字列。取れなかった時は null
 */
export function scrapeGiftHistoryMirrorHtml(root) {
  if (!root) return null;

  /** @type {Element|null} */
  let list = null;
  try {
    list =
      /** @type {any} */ (root).querySelector?.('ul.gift-history-list') ||
      /** @type {any} */ (root).querySelector?.(
        'ul[class*="gift-history-list"]'
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
 * 観測用ヘルパ。`ul.gift-history-list > li.item` の件数を返す。
 * 0 件のときは「サイドバーは描画されているがギフト 0 件配信」の判定に使える。
 *
 * @param {Document|HTMLElement|Element|null|undefined} root
 * @returns {number}
 */
export function countGiftHistoryItems(root) {
  if (!root) return 0;
  try {
    // NodeList は空でも truthy なので `||` フォールバックは効かない。length で判定する。
    const exact =
      /** @type {any} */ (root).querySelectorAll?.(
        'ul.gift-history-list > li.item'
      ) || null;
    if (exact && exact.length > 0) return exact.length;
    const partial =
      /** @type {any} */ (root).querySelectorAll?.(
        'ul[class*="gift-history-list"] > li[class*="item"]:not([class*="items"])'
      ) || null;
    return partial?.length || 0;
  } catch {
    return 0;
  }
}
