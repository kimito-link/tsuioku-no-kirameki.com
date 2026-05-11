/**
 * v0.1.252: `nls_event_dom_<lv>` bundle (top-frame scrape 結果) と
 * `nls_iframe_official_dom_<lv>` iframe relay storage (koken / audition iframe の
 * content script が postMessage 経由で送ってきた結果) の鏡 outerHTML field を
 * マージする純関数。
 *
 * 設計:
 * - bundle 側の鏡 field が空のときだけ iframe 側で埋める
 *   → Phase 1/2 ボタンで取った鏡を、サイドバー close 後の iframe relay null
 *     で上書きしないため
 * - bundle が無くても iframe 側に鏡があれば最小 bundle を返す
 *   → ユーザーが自然にサイドバーを開いた瞬間にも popup レーンに鏡が出る
 * - 両方空・両方 null なら null
 *
 * popup-entry.js の `refreshOfficialEventDomBundle` から inline で抽出（v0.1.253）。
 *
 * 純関数。副作用なし。input は不変。
 */

/**
 * @param {unknown} v
 * @returns {string|null}
 */
function strNonEmpty(v) {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * @param {unknown} v
 * @returns {Record<string, unknown>|null}
 */
function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? /** @type {Record<string, unknown>} */ (v)
    : null;
}

/**
 * @param {unknown} baseBundle - 通常は `chrome.storage.local.get('nls_event_dom_<lv>')` の値
 * @param {unknown} iframeBundle - 通常は `chrome.storage.local.get('nls_iframe_official_dom_<lv>')` の値
 * @returns {object|null} マージ済 bundle、または null
 */
export function mergeIframeRelayMirrorIntoBundle(baseBundle, iframeBundle) {
  const base = asPlainObject(baseBundle);
  const iframe = asPlainObject(iframeBundle);

  // 両方無ければ null
  if (!base && !iframe) return null;

  // iframe 側だけ → 最小 bundle を作る
  if (!base) {
    const iframeContribMirror = strNonEmpty(iframe?.contributionRankingMirrorHtml);
    const iframeGiftHistoryMirror = strNonEmpty(iframe?.giftHistoryMirrorHtml);
    if (!iframeContribMirror && !iframeGiftHistoryMirror) return null;
    return {
      contributionRankingMirrorHtml: iframeContribMirror,
      giftHistoryMirrorHtml: iframeGiftHistoryMirror
    };
  }

  // base 側だけ → そのまま
  if (!iframe) return base;

  // 両方 → bundle 側の鏡 field が空のときだけ iframe 側で埋める
  const merged = { ...base };
  const iframeContribMirror = strNonEmpty(iframe.contributionRankingMirrorHtml);
  const iframeGiftHistoryMirror = strNonEmpty(iframe.giftHistoryMirrorHtml);
  if (iframeContribMirror && !strNonEmpty(base.contributionRankingMirrorHtml)) {
    merged.contributionRankingMirrorHtml = iframeContribMirror;
  }
  if (iframeGiftHistoryMirror && !strNonEmpty(base.giftHistoryMirrorHtml)) {
    merged.giftHistoryMirrorHtml = iframeGiftHistoryMirror;
  }
  return merged;
}
