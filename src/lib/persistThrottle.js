/**
 * ストレージ書き込みのコアレシング（ロミさんの throttle パターン応用）。
 * 複数ソース（MutationObserver, NDGR, deepHarvest）からの行を
 * 最小間隔にまとめて1回の read-merge-write にする。
 *
 * @param {(batch: unknown[]) => Promise<void>} flushFn
 * @param {number} [minIntervalMs]
 */
export function createPersistCoalescer(flushFn, minIntervalMs = 300) {
  /** @type {unknown[]} */
  let buffer = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let lastFlushTime = 0;

  /** @param {unknown[]} rows */
  function enqueue(rows) {
    buffer.push(...rows);
    if (timer) return;
    const delay = lastFlushTime
      ? Math.max(0, minIntervalMs - (Date.now() - lastFlushTime))
      : minIntervalMs;
    timer = setTimeout(flush, delay);
  }

  async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    lastFlushTime = Date.now();
    await flushFn(batch);
  }

  function clear() {
    buffer = [];
    if (timer) { clearTimeout(timer); timer = null; }
  }

  return { enqueue, flush, clear, pending: () => buffer.length };
}
