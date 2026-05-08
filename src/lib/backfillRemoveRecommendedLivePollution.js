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
 * 検出ヒューリスティック（false positive を最小化）:
 *   - text が「N分経過」「N時間N分経過」「N分前」「N時間前」（duration label）
 *   - text が「LIVE」「タイムシフト」「公開終了」（status label）
 *   - userId が「lv\d+」形式（配信 ID を user ID として誤認）
 *
 * ギフトシステム文言は v0.1.196 の `backfillRemoveGiftSystemMessages` が
 * 担当するため、ここでは触らない（責務分離）。
 *
 * 純関数（input mutate せず、新しい array を返す）。
 *
 * @param {unknown} stored chrome.storage.local["nls_comments_<lv>"] の値
 * @returns {{ cleaned: unknown[], removedCount: number }}
 */
export function backfillRemoveRecommendedLivePollution(stored) {
  if (!Array.isArray(stored)) return { cleaned: [], removedCount: 0 };
  /** @type {unknown[]} */
  const cleaned = [];
  let removedCount = 0;
  for (const e of stored) {
    if (!e || typeof e !== 'object') {
      cleaned.push(e);
      continue;
    }
    const text = String(/** @type {{ text?: unknown }} */ (e).text || '').trim();
    const userId = String(/** @type {{ userId?: unknown }} */ (e).userId || '').trim();

    // 配信タイトル風 duration label（「N分経過」「N時間N分経過」など）
    if (/^\d+(?:時間\d*)?分経過$/.test(text)) {
      removedCount += 1;
      continue;
    }
    // 「N分前」「N時間前」などの相対時刻表記
    if (/^\d+\s*(?:時間|分|日)前$/.test(text)) {
      removedCount += 1;
      continue;
    }
    // status label
    if (text === 'LIVE' || text === 'タイムシフト' || text === '公開終了') {
      removedCount += 1;
      continue;
    }
    // userId が lv で始まる（配信 ID 誤認）
    if (/^lv\d+$/i.test(userId)) {
      removedCount += 1;
      continue;
    }

    cleaned.push(e);
  }
  return { cleaned, removedCount };
}
