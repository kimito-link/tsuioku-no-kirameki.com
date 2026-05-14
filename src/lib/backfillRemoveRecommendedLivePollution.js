/**
 * v0.1.200: v0.1.199 以前の間に「おすすめ生放送」セクションの DOM が
 * `nls_comments_<lv>` に通常コメントとして persist されていた汚染を除去する純関数。
 *
 * 真因（2026-05-06 確定）:
 *   ニコ生 watch ページの右側「おすすめ生放送」カード群は CSS Modules
 *   ハッシュ命名（___program-card-list___HASH 等）で描画される。
 *   拡張の comment scraper が使う `[class*="comment" i]` 部分一致 selector が
 *   カード内 `comment-count` 等に hit してしまい、配信タイトル（「LIVE」「N分経過」等）
 *   や配信ID（lvXXXXXXX）がコメントとして storage に書き込まれていた。
 *
 *   v0.1.200 の root cause fix（src/lib/nicoliveDom.js のガード追加）後の
 *   後始末。それ以前に汚染した storage 行を popup 起動時に 1 回だけ除去する。
 *
 * ギフトシステム文言は v0.1.196 の `backfillRemoveGiftSystemMessages` が
 * 担当するため、ここでは触らない（責務分離）。
 *
 * 純関数（input mutate せず、新しい array を返す）。
 */

/**
 * 1 行が「おすすめ生放送カード由来」の storage 汚染か（persist 前フィルタと共有）。
 *
 * @param {unknown} entry mergeNewComments 行または同等の { text?, userId? }
 * @returns {boolean}
 */
export function isRecommendedLivePollutionRow(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const text = String(/** @type {{ text?: unknown }} */ (entry).text || '').trim();
  const userId = String(/** @type {{ userId?: unknown }} */ (entry).userId || '').trim();

  if (/^\d+(?:時間\d*)?分経過$/.test(text)) return true;
  if (/^\d+\s*(?:時間|分|日)前$/.test(text)) return true;
  if (text === 'LIVE' || text === 'タイムシフト' || text === '公開終了') return true;
  if (/^lv\d+$/i.test(userId)) return true;
  // おすすめカードの `<time>22:28 開始</time>` 等（実コメントと衝突しにくい狭い形）
  if (/^\d{1,2}:\d{2}\s*開始$/.test(text)) return true;

  return false;
}

/**
 * @param {unknown} stored chrome.storage.local["nls_comments_<lv>"] の値
 * @returns {{ cleaned: unknown[], removedCount: number }}
 */
export function backfillRemoveRecommendedLivePollution(stored) {
  if (!Array.isArray(stored)) return { cleaned: [], removedCount: 0 };
  /** @type {unknown[]} */
  const cleaned = [];
  let removedCount = 0;
  for (const e of stored) {
    if (isRecommendedLivePollutionRow(e)) {
      removedCount += 1;
      continue;
    }
    cleaned.push(e);
  }
  return { cleaned, removedCount };
}
