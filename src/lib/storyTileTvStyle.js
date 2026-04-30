/**
 * ストーリータイル / レーンアバターで「ゆっくり風キャラ画像かどうか」を判定する純関数。
 *
 * 設計（0.1.37 AL: popup-entry.js コンポーネント分割の続き）:
 *   ストーリータイルの画像 src が拡張同梱のキャラ画像（`yukkuri-charactore-english/...`）
 *   なら、テレビ風の枠線スタイルを適用したい。公式 usericon / defaults とは別に
 *   見せたい意図。判定だけを純関数として切り出して unit test 可能にする。
 */

/**
 * @param {string|null|undefined} requestedSrc img タグに最初に指定された URL
 * @param {string|null|undefined} displaySrc 実際に表示されている URL（onerror フォールバック後）
 * @returns {boolean}
 */
export function storyTileUsesYukkuriTvStyle(requestedSrc, displaySrc) {
  const r = String(requestedSrc == null ? '' : requestedSrc);
  const d = String(displaySrc == null ? '' : displaySrc);
  return (
    r.includes('yukkuri-charactore-english') ||
    d.includes('yukkuri-charactore-english')
  );
}
