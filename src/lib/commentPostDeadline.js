/**
 * コメント送信(requestPostCommentToOpenTab)全体を総締切で有界化する純関数。
 *
 * 実機症状(2026-07-06): 「送信中…」が長時間張り付く。原因は
 *   requestPostCommentToOpenTab 内の tabsSendMessageWithRetry が frame ごとに
 *   複数回リトライする一方、関数全体には総締切が無く、受け手の content script が
 *   応答しないと await が長時間解けなかったこと。
 *
 * 設計方針(嘘をつかない):
 *   - 締切超過は「失敗」と断定しない。`{ ok: false, error, timedOut: true }` という
 *     専用の形で返し、呼び出し側が「明確な失敗」と区別できるようにする
 *     (ニコ生には届いている可能性があるため)。
 *   - 締切内に元の Promise が解決/拒否すれば、その結果をそのまま透過する
 *     (成功時は ok:true、通常失敗時は timedOut を含めない)。
 *
 * @typedef {{ ok: boolean, error?: string, timedOut?: boolean }} CommentPostOutcome
 */

/** 既定の総締切(ms)。tabsSendMessageWithRetry の最悪ケース(frame探索込み)より短く、
 *  UIが「送信中…」に固定される時間の上限として妥当な値。 */
export const COMMENT_POST_DEADLINE_MS = 5000;

/** 締切超過時にユーザーへ出す文言(嘘をつかない=失敗と断定しない)。 */
export const COMMENT_POST_TIMEOUT_MESSAGE =
  '送信に時間がかかっています。届いている可能性があるのでコメント欄を確認してください。';

/**
 * 任意の Promise<CommentPostOutcome> を総締切で有界化する。
 * 締切超過時は元の Promise を放置したまま(キャンセル手段がないため)、
 * `{ ok:false, error: COMMENT_POST_TIMEOUT_MESSAGE, timedOut:true }` を返す。
 *
 * @template {CommentPostOutcome} T
 * @param {Promise<T>} promise
 * @param {number} [ms]
 * @returns {Promise<T | { ok: false, error: string, timedOut: true }>}
 */
export function withCommentPostDeadline(promise, ms = COMMENT_POST_DEADLINE_MS) {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, error: COMMENT_POST_TIMEOUT_MESSAGE, timedOut: true });
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer != null) clearTimeout(timer);
  });
}

/**
 * revertLastSelfPostedComment を呼んでよいかを判定する純関数。
 * 「明確な失敗(result.ok===false かつ timedOut でない)」のときだけ true。
 * タイムアウト/応答不明では楽観表示を取り消さない
 * (ニコ生に届いている可能性があるコメントをレーンから消すと「一瞬載って消える」症状になる)。
 *
 * @param {CommentPostOutcome|null|undefined} result
 * @returns {boolean}
 */
export function shouldRevertOptimisticPost(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.ok !== false) return false;
  return result.timedOut !== true;
}
