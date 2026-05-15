/**
 * ニコニコ視聴ページ周辺に出る「おすすめユーザー／フォロー候補」系 UI の子孫かを粗く判定する。
 * コメント仮想リストと異なるが `[class*="comment" i]` 等に引っかかり userId＋短い本文だけが
 * コメント行として誤抽出されることがあるため、harvest 経路から除外する。
 *
 * CSS Modules 化に備え、静的名の部分一致と ref 付き user リンクを併用する。
 *
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
export function isInsideRecommendedUserSection(element) {
  if (!element || typeof (/** @type {any} */ (element).closest) !== 'function') {
    return false;
  }
  const el = /** @type {Element} */ (element);
  const classSelectors = [
    '[class*="user-recommend"]',
    '[class*="UserRecommend"]',
    '[class*="recommend-user"]',
    '[class*="RecommendCreator"]',
    '[class*="FollowingRecommend"]',
    '[class*="follow-recommend"]',
    '[class*="FollowRecommend"]'
  ];
  for (const sel of classSelectors) {
    try {
      if (el.closest(sel)) return true;
    } catch {
      // ignore invalid selector in old engines
    }
  }
  try {
    const a = el.closest('a[href*="/user/"]');
    if (a && a.getAttribute('href')) {
      const href = String(a.getAttribute('href') || '');
      if (
        /[?&]ref=recommend/i.test(href) ||
        /[?&]ref=follow_recommend/i.test(href) ||
        /[?&]ref=suggested_follow/i.test(href)
      ) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}
