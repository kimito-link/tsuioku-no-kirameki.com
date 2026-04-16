/**
 * 視聴タブのリロード直後は content script の readiness が揃わず、
 * 1発の `NLS_EXPORT_WATCH_SNAPSHOT` 要求が `{snapshot: null}` で返る瞬間がある。
 * ポップアップ側の polling 周期（10〜30秒）まで待たずに済むよう、短いバックオフで
 * 再試行して救済するためのラッパ。
 *
 * 呼び出し側（popup-entry.js）は `requestOnce` として単発のスナップショット要求関数を渡す。
 * 成功（`result.snapshot != null`）で即 return、失敗時は `baseDelayMs * (attempt+1)` 待って
 * リトライ。最大 `maxAttempts` 回。
 *
 * @template {{ snapshot: unknown|null }} R
 * @param {() => Promise<R>} requestOnce
 * @param {{
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 *   sleep?: (ms: number) => Promise<void>
 * }} [opts]
 * @returns {Promise<R>}
 */
export async function retrySnapshotRequestUntilReady(requestOnce, opts = {}) {
  const rawMax = opts.maxAttempts != null ? Number(opts.maxAttempts) : 3;
  const maxAttempts =
    Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 1;
  const rawDelay = opts.baseDelayMs != null ? Number(opts.baseDelayMs) : 450;
  const baseDelayMs =
    Number.isFinite(rawDelay) && rawDelay >= 0 ? Math.floor(rawDelay) : 450;
  const sleep =
    typeof opts.sleep === 'function'
      ? opts.sleep
      : /** @param {number} ms */ (ms) =>
          new Promise((r) => setTimeout(r, ms));

  /** @type {R} */
  // @ts-ignore - 初期値は最初の await で必ず上書きされる
  let last;
  for (let i = 0; i < maxAttempts; i++) {
    last = await requestOnce();
    if (last && last.snapshot != null) return last;
    if (i < maxAttempts - 1) {
      await sleep(baseDelayMs * (i + 1));
    }
  }
  return last;
}
