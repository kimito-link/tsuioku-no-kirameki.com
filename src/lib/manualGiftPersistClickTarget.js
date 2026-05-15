/**
 * E3b: ユーザーがニコ生のギフト／ランキング系 UI を操作したときだけ
 * `persistOfficialEventDomBundleNow` を走らせるための click ターゲット判定。
 * 拡張のインラインパネル（#inlineHostId）内は除外。
 *
 * @param {EventTarget | null} target
 * @param {string} extensionInlineHostId 例: nls-inline-popup-host
 * @returns {boolean}
 */
export function isManualGiftPersistClickTarget(target, extensionInlineHostId) {
  if (!(target instanceof Element)) return false;
  const hostSel =
    extensionInlineHostId && /^[a-zA-Z0-9_-]+$/.test(extensionInlineHostId)
      ? `#${extensionInlineHostId}`
      : '';
  try {
    if (hostSel && target.closest(hostSel)) return false;
  } catch {
    return false;
  }
  try {
    return !!target.closest(
      [
        '[class*="gift-sidebar"]',
        '[class*="gift-modal"]',
        '[class*="gift-popup"]',
        '[class*="rich-view"]',
        '[class*="program-gift-information"]',
        '[class*="ga-ns-program-gift-information"]',
        '[class*="gift-button"]',
        '[class*="gift-count-item"]',
        '[class*="audition-ranking-button"]',
        'button[aria-label*="ギフト"]',
        'button[title*="ギフト"]'
      ].join(', ')
    );
  } catch {
    return false;
  }
}
