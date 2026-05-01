/**
 * アバター URL の比較用ヘルパ（純粋関数）。
 *
 * 設計（0.1.39: popup-entry.js から切り出し）:
 *   ニコ生 CDN の usericon URL は同一画像でも `?cache_buster=...`, `?v=...`,
 *   `#frag` 等が付いて URL 文字列としては差が出ることがある。これらを
 *   「同じアバターを指す」として扱うため、query/hash を除去した href を
 *   比較キーにする。
 *
 *   `isSameAvatarUrl(a, b)` は両者が空でなく、同じキーになるか判定する。
 *   両方空 → false（「不明同士は同じ」とは扱いたくない）。
 */

/**
 * @param {unknown} raw
 * @returns {string} URL の query/hash を取り除いた href、または raw を trim した文字列。
 *   空入力時は空文字。URL として解釈できない場合は trim 済み raw。
 */
export function avatarCompareKey(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return s;
  }
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean} 両者とも非空で、query/hash を除去した URL が一致するか。
 */
export function isSameAvatarUrl(a, b) {
  const ka = avatarCompareKey(a);
  const kb = avatarCompareKey(b);
  return Boolean(ka && kb && ka === kb);
}
