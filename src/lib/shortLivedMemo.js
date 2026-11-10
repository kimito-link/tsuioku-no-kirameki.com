/**
 * 0.1.1961: 同じ問い合わせを短い間だけ使い回す(答えを待っている間の重複もまとめる)。
 *
 * 横の欄は描き直し(refresh)1回の中で collectWatchTabCandidates を約3回呼び、そのたびに
 * tabs.query({active})・windows.getLastFocused({populate})・tabs.query({}) を投げていた
 * (PC 計器: 60秒で refresh 115〜145回・tabs.query 421〜596回)。同じ引数なら ttlMs の間は前の答えを返す。
 * タブが動いたら(呼び出し側が clear を呼ぶ)すぐ捨てる。
 *
 * @template T
 * @param {(key: string) => Promise<T>} fn
 * @param {{ ttlMs?: number, now?: () => number, maxKeys?: number }} [opts]
 */
export function createShortLivedMemo(fn, opts = {}) {
  const ttlMs = Math.max(0, Number(opts.ttlMs ?? 400));
  const now = opts.now || (() => Date.now());
  const maxKeys = Math.max(1, Number(opts.maxKeys ?? 8));
  /** @type {Map<string, { at: number, p: Promise<T> }>} */
  const cache = new Map();
  let hits = 0;
  let calls = 0;
  /** @param {string} key */
  const get = (key) => {
    const k = String(key ?? '');
    calls += 1;
    const t = now();
    const hit = cache.get(k);
    if (hit && t - hit.at < ttlMs) {
      hits += 1;
      return hit.p;
    }
    const p = Promise.resolve().then(() => fn(k));
    const entry = { at: t, p };
    cache.set(k, entry);
    if (cache.size > maxKeys) cache.delete(cache.keys().next().value);
    // 失敗した答えは使い回さない
    p.catch(() => {
      if (cache.get(k) === entry) cache.delete(k);
    });
    return p;
  };
  return {
    get,
    clear: () => cache.clear(),
    stats: () => ({ calls, hits }),
  };
}
