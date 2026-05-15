/**
 * コメント送信経路の手元プロファイル（本番常時 ON にしない）。
 *
 * DevTools コンソールで `globalThis.__nlsCommentSubmitProfile = true` のあと送信すると、
 * 区間名と経過 ms のペアが `globalThis.__nlsCommentSubmitLastTimings` に入り、
 * `console.info` が1回出る（popup / content それぞれの global）。
 *
 * 計画メモの区間対応（概略）:
 * - **T1**: popup の `tabsSendMessageWithRetry` 前後（frame ごとに `T1-f{id}-send` / `T1-f{id}-res`）
 * - **T2**: content の editor `pollUntil` 前後
 * - **T3**: ダブル rAF + `reactSettleMs` まで
 * - **T4**: 送信ボタン探索〜 click まで
 * - **T5**: `confirmSubmittedCommentAsync`（1回目・必要なら2回目）
 *
 * 実装方針（計測後の最小チューニング）: `reactSettleMs` / popup リトライ間隔は据え置き。
 * 体感改善は `waitUntilEditorReflectsSubmit` の **送信直後（待ち前）プローブ**で速い成功経路を取る。
 * 数値の根拠が取れたら `COMMENT_SUBMIT_CONFIRM_PROBE_MS` や frame 優先は別コミットで検討。
 */

export const NLS_COMMENT_SUBMIT_PROFILE_FLAG = '__nlsCommentSubmitProfile';
export const NLS_COMMENT_SUBMIT_LAST_TIMINGS = '__nlsCommentSubmitLastTimings';

/** @returns {boolean} */
export function isCommentSubmitProfileEnabled() {
  try {
    const g = /** @type {Record<string, unknown>} */ (globalThis);
    return Boolean(g[NLS_COMMENT_SUBMIT_PROFILE_FLAG]);
  } catch {
    return false;
  }
}

/**
 * @param {{ now?: () => number }} [opts]
 * @returns {{ mark: (name: string) => void, finish: (label?: string) => void } | null}
 */
export function createCommentSubmitProfiler(opts = {}) {
  if (!isCommentSubmitProfileEnabled()) return null;
  const now =
    typeof opts.now === 'function' ? opts.now.bind(opts) : () => performance.now();
  const t0 = now();
  /** @type {Array<[string, number]>} */
  const phases = [];
  return {
    /** @param {string} name */
    mark(name) {
      phases.push([name, Math.round(now() - t0)]);
    },
    /** @param {string} [label] */
    finish(label = 'nls-comment-submit') {
      try {
        const g = /** @type {Record<string, unknown>} */ (globalThis);
        g[NLS_COMMENT_SUBMIT_LAST_TIMINGS] = phases;
      } catch (_) {
        /* ignore */
      }
      try {
        console.info(`[${label}]`, Object.fromEntries(phases));
      } catch (_) {
        /* ignore */
      }
    }
  };
}
