/**
 * popup / inline のコメント再描画スケジューラ。
 *
 * 旧実装は「550ms のデバウンス + 2200ms の最大待機」で、コメントが連打される
 * 配信（バースト）下では setTimeout が都度リセットされるため、結果として
 * 再描画が最大で 2.2 秒単位でしか走らず、コメント数の見た目が飛び飛びに更新
 * される "スムーズに撮れてない" 体感になっていた（バグ #4）。
 *
 * 新実装は「先行 + 末尾のスロットル」に切り替える:
 *   - 先行（leading）  : 直近 paint から throttleMs 以上経っていれば即時描画
 *   - 末尾（trailing） : 抑制中の変更は lastPaintAt + throttleMs で一度だけ描画
 *
 * これによりバースト中でも throttleMs 周期で描画が走り、コメント数の見た目が
 * 滑らかに追従する。デバウンスと違い trailing タイマーは延長されないため、
 * 連打中でも必ず throttleMs 以内に再描画が行われる。
 *
 * 副作用（setTimeout / Date.now）は deps で差し替え可能にしてユニットテスト
 * できるようにしている（persistThrottle と同じ設計方針）。
 *
 * @typedef {Object} CoalesceDeps
 * @property {() => number} now
 * @property {(fn: () => void, ms: number) => unknown} setTimer
 * @property {(id: unknown) => void} clearTimer
 *
 * @typedef {Object} ScheduleContext
 * @property {boolean} allHighFreq 変更キーがすべて高頻度キーだけか
 * @property {boolean} initialDone 初回 refresh 完了後か
 *
 * @param {{
 *   throttleMs?: number,
 *   deps?: Partial<CoalesceDeps>
 * }} [opts]
 */
export function createCoalescedRefreshScheduler(opts = {}) {
  const throttleMs = Number.isFinite(opts.throttleMs)
    ? Math.max(0, /** @type {number} */ (opts.throttleMs))
    : 450;
  const nowFn = opts.deps?.now || (() => Date.now());
  /** @type {(fn: () => void, ms: number) => unknown} */
  const setT = opts.deps?.setTimer || ((fn, ms) => setTimeout(fn, ms));
  /** @type {(id: unknown) => void} */
  const clearT = opts.deps?.clearTimer || ((id) => clearTimeout(/** @type {any} */ (id)));

  // 未描画状態は「十分昔に描画した」と等価に扱い、初回の先行描画を必ず通す。
  let lastPaintAt = Number.NEGATIVE_INFINITY;
  /** @type {unknown} */
  let trailingTimer = null;

  function clearTrailing() {
    if (trailingTimer != null) {
      clearT(trailingTimer);
      trailingTimer = null;
    }
  }

  /**
   * @param {ScheduleContext} ctx
   * @param {() => void} runRefresh
   */
  function schedule(ctx, runRefresh) {
    if (!ctx.initialDone) {
      // 初回描画はあらゆる抑制を無視して即時反映する
      clearTrailing();
      runRefresh();
      lastPaintAt = nowFn();
      return;
    }
    if (!ctx.allHighFreq) {
      // 非高頻度の変更（例: 設定トグル）は遅延させない
      clearTrailing();
      runRefresh();
      lastPaintAt = nowFn();
      return;
    }
    // 高頻度キー（nls_comments_* 等）: 先行＋末尾のスロットル
    const now = nowFn();
    const sinceLast = now - lastPaintAt;
    if (sinceLast >= throttleMs) {
      clearTrailing();
      runRefresh();
      lastPaintAt = nowFn();
      return;
    }
    // 直近に既に paint 済み: trailing を一度だけ積む（デバウンスのように延長しない）
    if (trailingTimer == null) {
      const delay = Math.max(0, throttleMs - sinceLast);
      trailingTimer = setT(() => {
        trailingTimer = null;
        runRefresh();
        lastPaintAt = nowFn();
      }, delay);
    }
  }

  function cancel() {
    clearTrailing();
  }

  /**
   * comment-post-speed-DESIGN.md §B-1: 自コメ送信/revert 直後の「押下直後の即時再描画」専用
   * バイパス。通常の throttleMs(450ms 既定)を無視して即時 runRefresh() を実行する。
   *
   * 【担う責務】
   *   - ユーザー自身の送信/revert 操作を起点とする refresh の前倒し実行(スロットル無視)。
   *   - floorMs(既定150ms)による即時パス同士の最小間隔保証(連打・音声自動送信の暴発防止)。
   *   - 実行時の lastPaintAt 更新(直後に来る通常 schedule の leading 判定を trailing に畳み、
   *     1送信で refresh 2連発になるのを防ぐ)。
   *
   * 【担わない責務】
   *   - schedule() の既定挙動(throttleMs・trailing)には一切影響しない(既存テスト無変更)。
   *
   * ★注意: 高頻度キー(NDGR由来)のバイパスにこの関数を流用してはならない。発火源は
   *   人間の送信操作のみを想定(呼び出し頻度がイベント流量に比例しない前提)。
   *
   * @param {() => void} runRefresh
   * @param {{ floorMs?: number }} [opts] floorMs 既定150ms
   * @returns {boolean} 実行したら true。floor 内でスキップしたら false(既存の trailing 予約に委ねる)。
   */
  function scheduleImmediate(runRefresh, opts = {}) {
    const floorMs = Number.isFinite(opts.floorMs) ? Math.max(0, /** @type {number} */ (opts.floorMs)) : 150;
    const now = nowFn();
    if (now - lastPaintAt < floorMs) return false;
    clearTrailing();
    runRefresh();
    lastPaintAt = nowFn();
    return true;
  }

  return {
    schedule,
    scheduleImmediate,
    cancel,
    /** 読み取り専用: 最後に runRefresh が呼ばれた時刻（テスト用） */
    lastPaintAtForTest: () => lastPaintAt
  };
}
