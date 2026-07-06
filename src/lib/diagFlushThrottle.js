/**
 * diagFlushThrottle.js
 *
 * 2026-07-06: 即時プッシュ計器(instantPushDiag)が「コメント送信バッチ毎に
 *   chrome.storage.local の get+set(read-modify-write)」を実行しており、実配信で
 *   1,648回/セッション・滝の間は秒間数回という新たな書き込み輻輳源になっていた
 *   (診断ページが「重くて開かない」一因)。表示のstorage迂回(v0.1.1092)自体の意義を
 *   計器が損なう本末転倒だったための根治。
 *
 * 設計:
 *   ・note(delta) は delta をメモリ上のキューに積むだけ(chrome.storage には一切触れない)。
 *     ここでは applyDelta を呼ばない=「複数の生 delta を1個の合成 delta に潰す」ことをしない。
 *     理由: applyXxxDiagDelta 系純関数は「lastGapMs/lastEventAt 等は delta に
 *     キーが存在すれば置換、存在しなければ既存値維持」という“フィールドの有無”で
 *     置換/加算を切り替える契約になっている。合成後の値は常に全キーを持つ完全な
 *     スナップショット形状になるため、これを再度 delta として渡すと「今回触っていない
 *     フィールド」まで誤って“delta で指定された値”として扱われ、既存値を巻き戻す
 *     (例: lastGapMs が触られていないのに -1 で上書きされる)。これを避けるため、
 *     flush 時に「読んだ storage 値」を起点として、溜めた生 delta を順番に
 *     applyDelta で1つずつ畳み込む(スキーマ非依存に安全)。
 *   ・累積キューは `flushMs` 間隔(既定10秒)でまとめて1回だけ read-merge-write する。
 *   ・キューが空(dirty でない)なら flush 自体をスキップする(set を呼ばない)。
 *   ・pagehide/visibilitychange 等の離脱イベントでは flush({ force: true }) を呼び、
 *     溜まっている差分を即座に吐き出す(取りこぼし防止)。
 *   ・isContextAlive() が false の間は note も flush も no-op(orphan ガード。
 *     hasExtensionContext() 相当を呼び出し側から注入する)。
 *
 * 計器の「意味」(累計値)は変えない。flush 遅延で表示が最大 flushMs だけ古くなるだけで、
 *   加算そのものは note() を呼んだ瞬間にキューへ積まれる(flush 時に必ず反映される)。
 *
 * commentPostDiag.js / instantPushDiag.js 等の「直前スナップショットに1個の差分delta を
 *   積算する純関数」(applyXxxDiagDelta(prev, delta) => nextSnapshot)と組み合わせて使う
 *   汎用ヘルパ。ここ自体は特定の diag スキーマに依存しない。
 *
 * @typedef {{
 *   note: (delta: Record<string, unknown>) => void,
 *   flush: (opts?: { force?: boolean }) => Promise<void>,
 *   queueLength: () => number,
 *   isDirty: () => boolean
 * }} ThrottledDiagFlusher
 */

/**
 * @param {(prev: any, delta: Record<string, unknown>) => any} applyDelta
 *   直前の累積値(prev)に今回差分(delta)を積算した次の累積値を返す純関数
 *   (instantPushDiag.js の applyInstantPushDiagDelta 等)。flush 時、storage から読んだ
 *   既存値を起点に、キューに溜まった生 delta を1つずつこの関数で畳み込む。
 * @param {string} key chrome.storage.local のキー
 * @param {{
 *   flushMs?: number,
 *   readStorage: (key: string) => Promise<Record<string, unknown>>,
 *   writeStorage: (items: Record<string, unknown>) => Promise<void>,
 *   isContextAlive?: () => boolean,
 *   setTimeoutFn?: (fn: () => void, ms: number) => unknown,
 *   clearTimeoutFn?: (handle: unknown) => void
 * }} opts
 * @returns {ThrottledDiagFlusher}
 */
export function createThrottledDiagFlusher(applyDelta, key, opts) {
  const {
    flushMs = 10000,
    readStorage,
    writeStorage,
    isContextAlive = () => true,
    setTimeoutFn,
    clearTimeoutFn
  } = opts || {};
  /** @type {(fn: () => void, ms: number) => unknown} */
  const doSetTimeout = setTimeoutFn || ((fn, ms) => setTimeout(fn, ms));
  /** @type {(handle: unknown) => void} */
  const doClearTimeout = clearTimeoutFn || ((h) => clearTimeout(/** @type {any} */ (h)));

  /** @type {Record<string, unknown>[]} まだ storage へ反映していない生 delta のキュー。 */
  let queue = [];
  /** @type {unknown} */
  let timer = null;
  /** flush() の直列化(同時に2回 read-merge-write が走らないようにする)。 */
  let flushMutex = Promise.resolve();

  function clearTimer() {
    if (timer != null) {
      doClearTimeout(timer);
      timer = null;
    }
  }

  function scheduleFlushIfNeeded() {
    if (timer != null) return;
    timer = doSetTimeout(() => {
      timer = null;
      void flush();
    }, flushMs);
  }

  /**
   * @param {Record<string, unknown>} delta
   */
  function note(delta) {
    if (!isContextAlive()) return;
    if (!delta || typeof delta !== 'object') return;
    queue.push(delta);
    scheduleFlushIfNeeded();
  }

  /**
   * @param {{ force?: boolean }} [flushOpts]
   * @returns {Promise<void>}
   */
  function flush(flushOpts = {}) {
    const run = flushMutex.then(() => flushBody(flushOpts));
    flushMutex = run.catch(() => {});
    return run;
  }

  /**
   * @param {{ force?: boolean }} flushOpts
   */
  async function flushBody(flushOpts) {
    clearTimer();
    if (!queue.length && !flushOpts.force) return;
    if (!isContextAlive()) return;
    const batch = queue;
    queue = [];
    if (!batch.length) return;
    try {
      const bag = await readStorage(key);
      let next = bag ? bag[key] : undefined;
      for (const delta of batch) {
        next = applyDelta(next, delta);
      }
      await writeStorage({ [key]: next });
    } catch {
      // no-op: 診断専用・記録には影響させない。ただし取りこぼし防止のため、
      //   失敗した分は再度キューへ戻し次回 flush で再試行する。
      queue = batch.concat(queue);
    }
  }

  return {
    note,
    flush,
    queueLength: () => queue.length,
    isDirty: () => queue.length > 0
  };
}
