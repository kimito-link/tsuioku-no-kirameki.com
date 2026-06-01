/**
 * v0.1.431: 連続フラッシュの合間にイベントループへ制御を返す既定の yield。
 * `scheduler.yield`（描画を挟んで続行・本来の用途）→ MessageChannel/setTimeout(0) の順。
 * @returns {Promise<void>}
 */
function defaultYieldBetweenFlushes() {
  try {
    const sched = /** @type {any} */ (globalThis).scheduler;
    if (sched && typeof sched.yield === 'function') {
      return sched.yield();
    }
  } catch {
    /* fall through */
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * ストレージ書き込みのコアレシング（ロミさんの throttle パターン応用）。
 * 複数ソース（MutationObserver, NDGR, deepHarvest）からの行を
 * 最小間隔にまとめて1回の read-merge-write にする。
 *
 * burstThreshold を指定すると、バッファが閾値を超えた時点で最小間隔を待たず
 * 即時 flush する（誕生日・ファンミ等の高流量で体感レイテンシを短縮）。
 *
 * ⭐v0.1.431: 高流量（過去ログ一括取り込み等）でバッファが連続して埋まると、flushBody の
 *   while ループが flush を背中合わせに何度も走らせ、その間メインスレッドを離さない。
 *   各 flush は巨大コメント配列の O(N) マージ＝1回でも重く、連続だと watch ページが
 *   「応答しません」になる（実機 4 万コメ配信で観測）。そこで「2 回目以降の連続 flush」の
 *   手前で yieldBetweenFlushes により一拍ブラウザへ制御を返す（描画/入力を通す）。1 回で
 *   終わる通常フロー（RT 記録）は yield せず＝体感レイテンシ不変。
 *
 * @param {(batch: unknown[], meta: { sources: string[] }) => Promise<void>} flushFn
 * @param {number | (() => number)} [minIntervalMs] 数値 or「呼ぶたび評価される関数」。
 *   関数にすると、隠れタブ（document.hidden）では間隔を伸ばす等、状況に応じて動的に
 *   スロットルできる（v0.1.497: 同一プロセスの裏タブが重い書き込みでメインスレッドを
 *   奪い、見ているタブまで固まる問題への対策）。
 * @param {number} [burstThreshold] 0 以下は無効（既定の throttle 挙動）
 * @param {() => Promise<void>} [yieldBetweenFlushes] 連続 flush の合間の yield（テスト注入用）
 */
export function createPersistCoalescer(
  flushFn,
  minIntervalMs = 300,
  burstThreshold = 0,
  yieldBetweenFlushes = defaultYieldBetweenFlushes
) {
  /** @returns {number} 現在の最小間隔（ms）。関数指定なら都度評価する。 */
  const resolveMinIntervalMs = () => {
    const raw =
      typeof minIntervalMs === 'function' ? minIntervalMs() : minIntervalMs;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 300;
  };
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

    let flushedOnce = false;
    while (buffer.length) {
      // v0.1.431: 2 回目以降の連続 flush の手前で一拍ブラウザへ制御を返す。これにより
      //   高流量（過去ログ取り込み）で巨大配列の O(N) マージが背中合わせに走っても、
      //   描画/入力が通り「応答しません」を防ぐ。初回 flush は yield しない＝通常フロー不変。
      if (flushedOnce) {
        await yieldBetweenFlushes();
        // yield 中にバッファが空になった可能性（clear など）に備えて再確認。
        if (!buffer.length) break;
      }
      lastFlushTime = Date.now();
      const { rows, sourcesOut } = drainChunksOnce();
      if (!rows.length) continue;
      await flushFn(rows, { sources: sourcesOut });
      flushedOnce = true;
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
      ? Math.max(0, resolveMinIntervalMs() - (Date.now() - lastFlushTime))
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
