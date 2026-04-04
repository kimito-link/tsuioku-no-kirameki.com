/**
 * 再読み込み直後など DOM が遅れて現れるまで待つ（純粋な間隔ポーリング）
 * @template T
 * @param {() => T|null|undefined|false} fn
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 * @returns {Promise<T|null>}
 */
export async function pollUntil(fn, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const intervalMs = opts.intervalMs ?? 100;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
