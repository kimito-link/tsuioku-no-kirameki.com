/**
 * 描き直し(refresh)の「実行中に来た要求は、あとで1回にまとめる」合流器(時計は deps で注入)。v0.1.1687
 *
 * ■ なぜ要るか(2026-10-19・実機の速報)
 *   サイドパネルを開いた直後の3秒で、popup の refresh が約0.1秒おきに10回以上(count_card→ranking_full の組)走り、
 *   毎回 100〜330ms 主スレッドを止めていた。refresh は新しく始めるたび世代番号を進め、走っていた古い refresh の
 *   描画は捨てる作りなので、並走した分は仕事の大半が無駄になる。全拡張文書が1つの主スレッドを共有するため、
 *   パネル自身の最初の描画も、ほかの文書の処理もその分遅れる。
 *
 * ■ 守ること
 *   - 実行中に何回要求が来ても、走るのは「いま実行中の1回」+「そのあとの1回」だけ(最新の保存を必ず1回は読む)。
 *   - まとめた要求の呼び手には、最後の実行が終わってから返す(古い結果のまま先へ進ませない)。
 *   - 連続して走る間に呼吸の間(gapMs)を置く(入力・描画に主スレッドを譲る)。
 *   - 失敗しても詰まらない(isRunning は必ず戻る・まとめた分も走る)。
 *
 * ■ 触らないもの: refresh 本体・世代番号・スロットル(popupStorageRefreshCoalesce)。ここは「並走を断つ」だけ。
 */

/**
 * @param {() => Promise<unknown>|unknown} run 1回ぶんの描き直し
 * @param {{ gapMs?: number, setTimer?: (fn: () => void, ms: number) => unknown }} [opts]
 */
export function createRefreshCoalescer(run, opts = {}) {
  const gapMs = Number.isFinite(opts.gapMs) ? Math.max(0, /** @type {number} */ (opts.gapMs)) : 100;
  const setT = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  /** @type {Promise<void>|null} */
  let running = null;
  // 「走っている最中か」は、最後の dirty 確認と【同じ同期区間】で false に戻す(Promise の後始末を待つと、その隙間に来た要求が失われる)。
  let active = false;
  let dirty = false;

  /** @returns {Promise<void>} */
  const gap = () => (gapMs > 0 ? new Promise((resolve) => { setT(() => resolve(undefined), gapMs); }) : Promise.resolve());

  async function loop() {
    /** @type {{ e: unknown }|null} */
    let firstError = null;
    let first = true;
    do {
      if (!first) await gap();
      first = false;
      dirty = false;
      try {
        await run();
      } catch (e) {
        if (!firstError) firstError = { e };
      }
    } while (dirty);
    active = false;
    if (firstError) throw firstError.e;
  }

  return {
    /** @returns {Promise<void>} 最後の実行が終わったら解決する */
    request() {
      if (active) {
        dirty = true;
        return running || Promise.resolve();
      }
      active = true;
      running = loop();
      return running;
    },
    isRunning: () => active
  };
}
