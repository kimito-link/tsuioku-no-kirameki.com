/**
 * watch タブ候補リストを「対象 watch URL と同じ pathname+search」を先頭に
 * 並べ替える純粋関数。
 *
 * 設計（0.1.36 AK: popup-entry.js コンポーネント分割の続き）:
 *   `collectWatchTabCandidates` で集めたタブ群から、`watchUrl` に最も近い
 *   タブを優先したい。pathname+search が一致するもの（rank 0）→
 *   解析できるが一致しないもの（rank 1）→ URL 解析失敗（rank 2）の順で並べる。
 *
 *   chrome / DOM 依存なしなので vitest 単体検証可能。
 */

/**
 * @typedef {{ id: number, url: string }} WatchTabCandidate
 */

/**
 * @param {WatchTabCandidate[]} candidates
 * @param {string} watchUrl
 * @returns {WatchTabCandidate[]} watchUrl と同じ pathname+search を優先した並び
 */
export function prioritizeWatchTabCandidates(candidates, watchUrl) {
  const arr = Array.isArray(candidates) ? candidates : [];
  const w = String(watchUrl == null ? '' : watchUrl).trim();
  if (!w) return arr;
  let refKey = '';
  try {
    const ref = new URL(w);
    refKey = `${ref.pathname.replace(/\/$/, '')}${ref.search}`;
  } catch {
    return arr;
  }
  /** @param {string} url */
  const rank = (url) => {
    try {
      const u = new URL(url);
      const k = `${u.pathname.replace(/\/$/, '')}${u.search}`;
      return k === refKey ? 0 : 1;
    } catch {
      return 2;
    }
  };
  return [...arr].sort((a, b) => rank(a.url) - rank(b.url));
}
