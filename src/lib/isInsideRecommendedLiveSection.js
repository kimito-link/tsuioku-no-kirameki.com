/**
 * v0.1.200: ニコ生 watch ページの「おすすめ生放送」セクション内 DOM を識別する純関数。
 *
 * 真因（2026-05-06 確定）:
 *   ニコ生 watch ページの右側パネルや下部に表示される「おすすめ生放送」カード群は
 *   `___program-card-list___HASH` / `___program-card___HASH` 等の CSS Modules
 *   クラスで描画される。各カードには `comment-count`（コメント数）/`watch-count`
 *   （来場者数）等の class が付くため、拡張が `[class*="comment" i]` 部分一致 selector
 *   でコメント行を探すと、おすすめ列の `comment-count` 要素が誤 hit してしまう。
 *
 *   結果：配信タイトル（例: 「LIVE」「公開終了」「○分前」）や配信ID（lvXXXXXXX）が
 *   コメントとして storage に書き込まれ、popup の「ユーザー別応援件数」が壊れていた。
 *
 * 実装方針:
 *   - CSS Modules はビルドごとにハッシュが変わるので、`[class*="..."]`
 *     部分一致で識別する（ハッシュ前後の static 部分が必ず残る）。
 *   - 一致候補は親方向の closest で辿る（要素自身も含む）。
 *   - `a[href*="ProgramRecommendPanel"]` は ref パラメータが安定しやすい（2026-05 実 DOM）。
 *   - selector のいずれかが parse error を投げても安全に false を返す。
 *
 * @param {Element|null|undefined} element 判定対象の DOM 要素
 * @returns {boolean} おすすめ生放送セクション（の子孫）なら true
 */
export function isInsideRecommendedLiveSection(element) {
  if (!element || typeof (/** @type {any} */ (element).closest) !== 'function') {
    return false;
  }
  const el = /** @type {Element} */ (element);
  // v0.1.351: 高流量時のパフォーマンス改善。従来は selector ごとに closest を
  //   個別実行し、コメント 1 行あたり最大 8 回も祖先チェーンを登っていた
  //   （extractCommentsFromNode が root + 行ごと + parseCommentElement で呼ぶため、
  //   100 行のコメント欄では単一 MutationObserver イベントで数百回）。
  //   closest はカンマ区切りで「いずれかにマッチする最近祖先」を 1 回の祖先走査で
  //   返すため、結合 selector にすると走査回数が 1/8 になる（真偽値の意味は不変＝
  //   どれか 1 つでも祖先マッチすれば true）。
  const COMBINED_SELECTOR =
    '[class*="program-card-list"],[class*="program-card"],[class*="program-recommend"],[class*="loading-form"],[class*="loading-target"],[class*="program-statistics"]';
  try {
    if (el.closest(COMBINED_SELECTOR)) return true;
  } catch {
    // セレクタが古い環境で SyntaxError 等を出しても無視して継続
  }
  // ProgramRecommendPanel 専用 URL（コメント欄の user リンクとは衝突しにくい）
  try {
    if (el.closest('a[href*="ProgramRecommendPanel"]')) return true;
  } catch {
    // ignore
  }
  // カード内の comment-count は a の兄弟配下にあり、href だけでは closest できない
  try {
    const art = el.closest(
      'article[class*="program-card"], article.ga-ns-program-card, article.program-card'
    );
    if (art && art.querySelector?.('a[href*="ProgramRecommendPanel"]')) return true;
  } catch {
    // ignore
  }
  return false;
}
