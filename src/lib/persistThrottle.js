/**
 * ストレージ書き込みのコアレシング（ロミさんの throttle パターン応用）。
 * 複数ソース（MutationObserver, NDGR, deepHarvest）からの行を
 * 最小間隔にまとめて1回の read-merge-write にする。
 *
 * burstThreshold を指定すると、バッファが閾値を超えた時点で最小間隔を待たず
 * 即時 flush する（誕生日・ファンミ等の高流量で体感レイテンシを短縮）。
 *
 * @param {(batch: unknown[], meta: { sources: string[] }) => Promise<void>} flushFn
 * @param {number} [minIntervalMs]
 * @param {number} [burstThreshold] 0 以下は無効（既定の throttle 挙動）
 */
export function createPersistCoalescer(flushFn, minIntervalMs = 300, burstThreshold = 0) {
  /** @type {{ rows: unknown[], source?: string }[]} */
  let buffer = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let lastFlushTime = 0;
  /** @type {Promise<void>} */
  let flushMutex = Promise.resolve();

  /**
   * await flushFn 中にも enqueue されると、その分は別バッチになる。
   * 単一フラッシュ処理内でバッファが空になるまで繰り返し drain することで取りこぼしと
   * flush の中途半端な並走を抑える。
   */
  async function flushBody() {
    /** @returns {{ rows: unknown[], sourcesOut: string[] }} */
    const drainChunksOnce = () => {
      const chunks = buffer;
      buffer = [];
      /** @type {unknown[]} */
      const rows = [];
      /** @type {string[]} */
      const sourcesOut = [];
      for (const c of chunks) {
        rows.push(...c.rows);
        if (c.source) sourcesOut.push(c.source);
      }
      return { rows, sourcesOut };
    };

    while (buffer.length) {
      lastFlushTime = Date.now();
      const { rows, sourcesOut } = drainChunksOnce();
      if (!rows.length) continue;
      await flushFn(rows, { sources: sourcesOut });
    }
  }

  async function enqueueFlushSerialized() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    /** @type {Promise<void>} */
    const run = flushMutex.then(flushBody);
    flushMutex = run.catch(() => {});
    await run;
  }

  /**
   * @param {unknown[]} rows
   * @param {string} [source] 取り込み経路（コメント ingest ログ用）
   */
  function enqueue(rows, source) {
    buffer.push({
      rows,
      source: typeof source === 'string' && source ? source.slice(0, 32) : ''
    });
    const totalLen = buffer.reduce((n, c) => n + c.rows.length, 0);
    if (burstThreshold > 0 && totalLen >= burstThreshold) {
      // バースト閾値到達: 即時 flush（既存の timer は flush() 内でクリア）
      void enqueueFlushSerialized();
      return;
    }
    if (timer) return;
    const delay = lastFlushTime
      ? Math.max(0, minIntervalMs - (Date.now() - lastFlushTime))
      : 0;
    timer = setTimeout(() => {
      void enqueueFlushSerialized();
    }, delay);
  }

  function flush() {
    return enqueueFlushSerialized();
  }

  function clear() {
    buffer = [];
    if (timer) { clearTimeout(timer); timer = null; }
    flushMutex = Promise.resolve();
  }

  return { enqueue, flush, clear, pending: () => buffer.reduce((n, c) => n + c.rows.length, 0) };
}
