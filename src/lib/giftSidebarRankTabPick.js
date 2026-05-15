/**
 * ギフトサイドバー内から「貢献度ランキング」タブ相当の要素を選ぶ。
 * auto-open 用。document 全体は走査しない（誤クリック防止）。
 */

const RANK_TAB_TEXT_RE = /ランキング|Ranking|貢献|順位表/i;
/** タブラベルが折り返し・注釈付きで長くなるケース向けに 30→56 に緩和 */
const RANK_TAB_MAX_VISIBLE_TEXT = 56;

/**
 * @param {Element | null} sidebarRoot
 * @returns {{ element: HTMLElement | null, finder: string }}
 */
export function findGiftSidebarRankTabElement(sidebarRoot) {
  if (!(sidebarRoot instanceof HTMLElement)) {
    return { element: null, finder: '' };
  }
  try {
    const candidates = sidebarRoot.querySelectorAll(
      '[role="tab"], button, a, li, div[class*="tab"], span[class*="tab"]'
    );
    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      const t = String(el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (t && t.length <= RANK_TAB_MAX_VISIBLE_TEXT && RANK_TAB_TEXT_RE.test(t)) {
        return { element: el, finder: `text:${el.tagName.toLowerCase()}` };
      }
      const aria = String(
        el.getAttribute('aria-label') || el.getAttribute('title') || ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (
        aria &&
        aria.length <= RANK_TAB_MAX_VISIBLE_TEXT &&
        RANK_TAB_TEXT_RE.test(aria)
      ) {
        return { element: el, finder: `aria:${el.tagName.toLowerCase()}` };
      }
    }
    const byCls = sidebarRoot.querySelector(
      '[class*="ranking-tab"], [class*="contribution-tab"], [class*="ranker-tab"]'
    );
    if (byCls instanceof HTMLElement) {
      return { element: byCls, finder: 'class' };
    }
  } catch {
    return { element: null, finder: '' };
  }
  return { element: null, finder: '' };
}
