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
  // v0.1.351: 高流量時のパフォーマンス改善。selector ごとの個別 closest（最大 7 回の
  //   祖先走査）を、カンマ区切りの結合 selector による 1 回の走査に置き換える。
  //   closest はいずれかにマッチする最近祖先を返すので真偽値の意味は不変。
  const COMBINED_CLASS_SELECTOR =
    '[class*="user-recommend"],[class*="UserRecommend"],[class*="recommend-user"],[class*="RecommendCreator"],[class*="FollowingRecommend"],[class*="follow-recommend"],[class*="FollowRecommend"],[class*="RecommendedUser"],[class*="recommended-user"],[class*="SuggestedCreator"],[class*="SideRecommend"],[class*="PickUpUser"],[class*="PickupUser"]';
  try {
    if (el.closest(COMBINED_CLASS_SELECTOR)) return true;
  } catch {
    // ignore invalid selector in old engines
  }
  try {
    const a = el.closest('a[href*="/user/"]');
    if (a && a.getAttribute('href')) {
      const href = String(a.getAttribute('href') || '');
      if (
        /[?&]ref=recommend/i.test(href) ||
        /[?&]ref=follow_recommend/i.test(href) ||
        /[?&]ref=suggested_follow/i.test(href) ||
        /[?&]ref=user_recommend/i.test(href) ||
        /[?&]ref=watch_follow_recommend/i.test(href) ||
        /[?&]ref=profile_pickup/i.test(href)
      ) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}
