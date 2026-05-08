import { parseGiftCommentText } from './parseGiftComment.js';

/**
 * v0.1.172 〜 v0.1.194 までの間に NDGR ギフトシステムメッセージが
 * `nls_comments_<lv>` に通常コメントとして persist されていた汚染を除去する純関数。
 *
 * 真因: ギフトシステム行は `chat.rawUserId = ギフト送信者の uid`
 *   + `chat.content = "○○さんがギフト「XXX（Npt）」を贈りました"` という構造。
 *   v0.1.172 の `requireText: true` filter は「text 空」前提だったため、
 *   text 非空のギフトシステム行が素通りして popup の「ユーザー別応援件数」に
 *   非コメユーザーが混入していた。
 *
 * v0.1.195 で `cleanNdgrChatRows` / `ndgrChatRows` 側で gift パターンを
 * skip するようにしたが、それ以前に書き込まれた汚染は storage に残るため、
 * popup 起動時 1 回だけこの migration で除去する。
 *
 * 純関数（input mutate せず、新しい array を返す）。
 *
 * @param {unknown} stored chrome.storage.local["nls_comments_<lv>"] の値
 * @returns {{ cleaned: unknown[], removedCount: number }}
 */
export function backfillRemoveGiftSystemMessages(stored) {
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
    if (parseGiftCommentText(text)) {
      removedCount += 1;
      continue;
    }
    cleaned.push(e);
  }
  return { cleaned, removedCount };
}
