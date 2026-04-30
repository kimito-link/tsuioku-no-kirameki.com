/**
 * `URL.createObjectURL` で作った blob URL を、メモリ滞留を抑えながら revoke する
 * 軽量キュー。
 *
 * 設計（0.1.31 AF: マーケ DL 等の memory pressure 削減）:
 *   - 旧実装は `setTimeout(() => URL.revokeObjectURL(url), 60_000)` 固定。
 *     5 回 DL すると最大 5 個 × 巨大 blob × 60 秒 で 100MB 超が滞留する。
 *   - 改善: queue に登録し
 *       (a) 既定 15 秒経過したら revoke（DL 開始までの猶予）
 *       (b) 同時保持上限を超えたら古いものから即 revoke
 *     を組み合わせる。
 *
 *   注意: blob URL は `<a download>` で click した直後にブラウザがメモリ
 *   バッファに読み込むので、click 後 ~1-2 秒で revoke しても DL は完了する。
 *   旧実装の 60 秒は安全側の過剰見積もりだった（コメントに 0.1.9 の経緯）。
 *   ここは 15 秒に短縮しつつ queue 上限で押さえる。
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CONCURRENT = 3;

/**
 * @typedef {{
 *   url: string,
 *   timer: ReturnType<typeof setTimeout>|null
 * }} QueuedRevoke
 */

/**
 * @param {{
 *   timeoutMs?: number,
 *   maxConcurrent?: number,
 *   revoke?: (url: string) => void,
 *   schedule?: (cb: () => void, ms: number) => any,
 *   cancel?: (handle: any) => void
 * }} [opts]
 */
export function createObjectUrlRevokeQueue(opts = {}) {
  const timeoutMs =
    typeof opts?.timeoutMs === 'number' && opts.timeoutMs > 0
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const maxConcurrent =
    typeof opts?.maxConcurrent === 'number' && opts.maxConcurrent > 0
      ? Math.floor(opts.maxConcurrent)
      : DEFAULT_MAX_CONCURRENT;
  const revokeFn =
    typeof opts?.revoke === 'function'
      ? opts.revoke
      : /** @param {string} u */ (u) => {
          try {
            URL.revokeObjectURL(u);
          } catch {
            // no-op
          }
        };
  const scheduleFn =
    typeof opts?.schedule === 'function' ? opts.schedule : setTimeout;
  const cancelFn =
    typeof opts?.cancel === 'function' ? opts.cancel : clearTimeout;

  /** @type {QueuedRevoke[]} */
  const queue = [];

  /**
   * @param {string} url
   * @returns {void}
   */
  function enqueue(url) {
    if (!url) return;
    // 上限超過時は最古から即 revoke
    while (queue.length >= maxConcurrent) {
      const oldest = queue.shift();
      if (oldest?.timer != null) cancelFn(oldest.timer);
      if (oldest?.url) revokeFn(oldest.url);
    }
    /** @type {QueuedRevoke} */
    const entry = { url, timer: null };
    entry.timer = scheduleFn(() => {
      // queue から自分を除去して revoke
      const idx = queue.indexOf(entry);
      if (idx >= 0) queue.splice(idx, 1);
      revokeFn(entry.url);
    }, timeoutMs);
    queue.push(entry);
  }

  /**
   * すべての pending を即 revoke してキューを空にする（拡張アンロード時など）。
   */
  function flushAll() {
    while (queue.length > 0) {
      const e = queue.shift();
      if (e?.timer != null) cancelFn(e.timer);
      if (e?.url) revokeFn(e.url);
    }
  }

  /**
   * @returns {number}
   */
  function size() {
    return queue.length;
  }

  return { enqueue, flushAll, size };
}
