/**
 * key 単位の single-flight 実行器(純関数コア)。
 *
 * heavyRace根治(HANDOFF-heavyrace-backfill-IMPL.md §C-1)の中核ロジック: 同一 key の
 * 非同期処理が進行中なら新規実行を張らず、その進行中 promise に合流させる。
 * popup-entry.js の readHeavyFromStoreGuarded(同一 lv の heavy 全件 read を多重に張らない)
 * が最初の利用箇所。key を汎用にしたのは他の refresh 系レースにも応用できるため。
 *
 * @module singleFlightByKey
 */

/**
 * @template T
 * @typedef {{
 *   run: (key: string, fn: () => Promise<T>) => Promise<T>,
 *   joinCount: () => number
 * }} SingleFlightByKey
 */

/**
 * @template T
 * @returns {SingleFlightByKey<T>}
 */
export function createSingleFlightByKey() {
  /** @type {{ key: string, promise: Promise<T> } | null} */
  let inflight = null;
  let joins = 0;

  /**
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  function run(key, fn) {
    if (inflight && inflight.key === key) {
      joins += 1;
      return inflight.promise;
    }
    const p = fn();
    inflight = { key, promise: p };
    // reject でも必ず inflight をクリアする(次呼び出しが永久に古い reject 済み promise へ
    // 合流しないように)。自分がまだ最新の inflight のときだけクリアする(古い実行の finally が
    // 新しい実行の inflight を誤って消さないため)。
    p.finally(() => {
      if (inflight && inflight.promise === p) inflight = null;
    }).catch(() => {
      // finally 自体は reject を re-throw しない(catch は unhandled rejection 抑止のみ)。
    });
    return p;
  }

  return { run, joinCount: () => joins };
}
