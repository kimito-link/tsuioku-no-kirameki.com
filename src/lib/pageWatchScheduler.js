// pageWatchScheduler.js — 全配信サービスの視聴ページで共有する「ページ監視・定期チェック」スケジューラ。
//   サービス入口ごとに乱立している 1 秒 setInterval（URL 監視・生存確認・定期ポーリング）を 1 本のタイマーへ束ね、
//   裏タブやしまった状態では停止または大きく間引くことで、低スペック PC（アクセラレーション OFF）の負荷を抑える。
//   API 応答の成否バックオフは infoPollGate.js、rAF 描画の束ねは venuePaintSchedule.js が正本（役割を重複させない）。
// @layer L0 — 純粋ロジック / タイマー・可視状態・URL 取得は呼び出し側が注入する

/**
 * @typedef {'pause' | 'throttle' | 'always'} VisibilityPolicy
 * @typedef {'interval' | 'url' | 'kick' | 'start'} PageWatchRunReason
 * @typedef {{
 *   now: number,
 *   url: string,
 *   hidden: boolean,
 *   paused: boolean,
 *   reason: PageWatchRunReason
 * }} PageWatchRunContext
 * @typedef {{
 *   id: string,
 *   intervalMs: number,
 *   hiddenMode?: VisibilityPolicy,
 *   hiddenIntervalMs?: number,
 *   pausedMode?: VisibilityPolicy,
 *   pausedIntervalMs?: number,
 *   runOnUrlChange?: boolean,
 *   run: (ctx: PageWatchRunContext) => void
 * }} PageWatchTaskSpec
 */

const DEFAULT_BASE_TICK_MS = 1000;
const DEFAULT_HIDDEN_THROTTLE_MS = 10_000;

/**
 * タスクの現在状態から「今回の tick で実行してよいか」を判定する純関数。
 *
 * @param {{
 *   now: number,
 *   lastRunAt: number,
 *   intervalMs: number,
 *   hidden?: boolean,
 *   paused?: boolean,
 *   hiddenMode?: VisibilityPolicy,
 *   hiddenIntervalMs?: number,
 *   pausedMode?: VisibilityPolicy,
 *   pausedIntervalMs?: number,
 *   urlChanged?: boolean,
 *   runOnUrlChange?: boolean,
 *   forceImmediate?: boolean
 * }} s
 * @returns {{ run: boolean, skipReason: '' | 'hidden' | 'paused' | 'interval' }}
 */
export function evaluatePageWatchTask(s) {
  const hidden = s.hidden === true;
  const paused = s.paused === true;
  const hiddenMode = s.hiddenMode || 'pause';
  const pausedMode = s.pausedMode || 'always';

  if (hidden && hiddenMode === 'pause') {
    return { run: false, skipReason: 'hidden' };
  }
  if (paused && pausedMode === 'pause') {
    return { run: false, skipReason: 'paused' };
  }

  if (s.forceImmediate === true) {
    return { run: true, skipReason: '' };
  }
  if (s.urlChanged === true && s.runOnUrlChange === true) {
    return { run: true, skipReason: '' };
  }

  let effectiveInterval = Math.max(0, Number(s.intervalMs) || 0);
  if (hidden && hiddenMode === 'throttle') {
    const hMs = Math.max(effectiveInterval, Number(s.hiddenIntervalMs) || DEFAULT_HIDDEN_THROTTLE_MS);
    effectiveInterval = hMs;
  }
  if (paused && pausedMode === 'throttle') {
    const pMs = Math.max(effectiveInterval, Number(s.pausedIntervalMs) || DEFAULT_HIDDEN_THROTTLE_MS);
    effectiveInterval = pMs;
  }

  if (!Number.isFinite(s.lastRunAt)) {
    return { run: true, skipReason: '' };
  }
  const elapsed = Number(s.now) - Number(s.lastRunAt);
  if (elapsed < effectiveInterval) {
    return { run: false, skipReason: 'interval' };
  }
  return { run: true, skipReason: '' };
}

/**
 * 複数タスクの定期監視を 1 本のベースタイマーに集約するスケジューラ。
 *
 * @param {{
 *   baseTickMs?: number,
 *   now?: () => number,
 *   getUrl?: () => string,
 *   isHidden?: () => boolean,
 *   isPaused?: () => boolean,
 *   isAlive?: () => boolean,
 *   onUrlChange?: (nextUrl: string, prevUrl: string) => void,
 *   onError?: (err: unknown, taskId: string) => void,
 *   setIntervalFn?: (fn: () => void, ms: number) => unknown,
 *   clearIntervalFn?: (handle: unknown) => void,
 *   setTimeoutFn?: (fn: () => void, ms: number) => unknown,
 *   clearTimeoutFn?: (handle: unknown) => void
 * }} [opts]
 */
export function createPageWatchScheduler(opts = {}) {
  const baseTickMs = Math.max(50, Math.floor(Number(opts.baseTickMs) || DEFAULT_BASE_TICK_MS));
  const nowFn = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const getUrlFn = typeof opts.getUrl === 'function' ? opts.getUrl : () => '';
  const isHiddenFn = typeof opts.isHidden === 'function' ? opts.isHidden : () => false;
  const isPausedFn = typeof opts.isPaused === 'function' ? opts.isPaused : () => false;
  const isAliveFn = typeof opts.isAlive === 'function' ? opts.isAlive : () => true;
  const onUrlChange = typeof opts.onUrlChange === 'function' ? opts.onUrlChange : null;
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  /** @type {(fn: () => void, ms: number) => unknown} */
  const doSetInterval =
    typeof opts.setIntervalFn === 'function'
      ? opts.setIntervalFn
      : (/** @type {() => void} */ fn, /** @type {number} */ ms) => setInterval(fn, ms);
  /** @type {(handle: unknown) => void} */
  const doClearInterval =
    typeof opts.clearIntervalFn === 'function'
      ? opts.clearIntervalFn
      : (/** @type {unknown} */ h) => clearInterval(/** @type {any} */ (h));
  /** @type {(fn: () => void, ms: number) => unknown} */
  const doSetTimeout =
    typeof opts.setTimeoutFn === 'function'
      ? opts.setTimeoutFn
      : (/** @type {() => void} */ fn, /** @type {number} */ ms) => setTimeout(fn, ms);
  /** @type {(handle: unknown) => void} */
  const doClearTimeout =
    typeof opts.clearTimeoutFn === 'function'
      ? opts.clearTimeoutFn
      : (/** @type {unknown} */ h) => clearTimeout(/** @type {any} */ (h));

  /** @type {Map<string, { spec: PageWatchTaskSpec, lastRunAt: number }>} */
  const tasks = new Map();
  /** @type {unknown} */
  let intervalHandle = null;
  /** @type {unknown} */
  let kickHandle = null;
  let running = false;
  let lastUrl = '';
  let urlInitialized = false;

  const counters = {
    ticks: 0,
    runs: 0,
    skippedHidden: 0,
    skippedPaused: 0,
    urlChanges: 0,
    errors: 0,
  };

  function safeReadUrl() {
    try {
      return String(getUrlFn() || '');
    } catch {
      return lastUrl;
    }
  }

  /**
   * @param {() => boolean} fn
   * @returns {boolean}
   */
  function safeReadBool(fn) {
    try {
      return !!fn();
    } catch {
      return false;
    }
  }

  function clearKickTimer() {
    if (kickHandle != null) {
      doClearTimeout(kickHandle);
      kickHandle = null;
    }
  }

  function stop() {
    running = false;
    clearKickTimer();
    if (intervalHandle != null) {
      doClearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  /**
   * 1 回の評価を実行する。生存チェックが false なら自動停止する。
   * @param {PageWatchRunReason} [reason]
   * @returns {number} 今回実行したタスク数
   */
  function tick(reason = 'interval') {
    if (!safeReadBool(isAliveFn)) {
      stop();
      return 0;
    }
    counters.ticks += 1;
    const now = nowFn();
    const hidden = safeReadBool(isHiddenFn);
    const paused = safeReadBool(isPausedFn);
    const url = safeReadUrl();

    let urlChanged = false;
    if (!urlInitialized) {
      lastUrl = url;
      urlInitialized = true;
    } else if (url !== lastUrl) {
      const prevUrl = lastUrl;
      lastUrl = url;
      urlChanged = true;
      counters.urlChanges += 1;
      if (onUrlChange) {
        try {
          onUrlChange(url, prevUrl);
        } catch (err) {
          counters.errors += 1;
          if (onError) onError(err, '__url__');
        }
      }
    }

    const effectiveReason = urlChanged ? 'url' : reason;
    let executed = 0;

    for (const entry of tasks.values()) {
      const { spec } = entry;
      const decision = evaluatePageWatchTask({
        now,
        lastRunAt: entry.lastRunAt,
        intervalMs: spec.intervalMs,
        hidden,
        paused,
        hiddenMode: spec.hiddenMode,
        hiddenIntervalMs: spec.hiddenIntervalMs,
        pausedMode: spec.pausedMode,
        pausedIntervalMs: spec.pausedIntervalMs,
        urlChanged,
        runOnUrlChange: spec.runOnUrlChange,
        forceImmediate: reason === 'start',
      });
      if (!decision.run) {
        if (decision.skipReason === 'hidden') counters.skippedHidden += 1;
        else if (decision.skipReason === 'paused') counters.skippedPaused += 1;
        continue;
      }
      entry.lastRunAt = now;
      executed += 1;
      counters.runs += 1;
      try {
        spec.run({ now, url, hidden, paused, reason: effectiveReason });
      } catch (err) {
        counters.errors += 1;
        if (onError) onError(err, spec.id);
      }
    }
    return executed;
  }

  /**
   * タスクを登録する。同じ id を再登録すると上書きし、lastRunAt はリセットされる。
   * @param {PageWatchTaskSpec} spec
   */
  function register(spec) {
    if (!spec || typeof spec.id !== 'string' || !spec.id.trim()) {
      throw new TypeError('pageWatchScheduler.register requires a non-empty task id');
    }
    if (typeof spec.run !== 'function') {
      throw new TypeError(`pageWatchScheduler.register(${spec.id}) requires a run function`);
    }
    tasks.set(spec.id, {
      spec: {
        id: spec.id,
        intervalMs: Math.max(0, Number(spec.intervalMs) || 0),
        hiddenMode: spec.hiddenMode || 'pause',
        hiddenIntervalMs: spec.hiddenIntervalMs,
        pausedMode: spec.pausedMode || 'always',
        pausedIntervalMs: spec.pausedIntervalMs,
        runOnUrlChange: spec.runOnUrlChange === true,
        run: spec.run,
      },
      lastRunAt: -Infinity,
    });
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function unregister(id) {
    return tasks.delete(id);
  }

  /**
   * @param {{ runImmediately?: boolean }} [startOpts]
   */
  function start(startOpts = {}) {
    if (running) return;
    if (!safeReadBool(isAliveFn)) return;
    running = true;
    lastUrl = safeReadUrl();
    urlInitialized = true;
    intervalHandle = doSetInterval(() => {
      if (!running) return;
      tick('interval');
    }, baseTickMs);
    if (startOpts.runImmediately === true) {
      tick('start');
    }
  }

  /**
   * 表タブ復帰・パネル展開・URL 変化通知などで保留タスクを 1 回だけ再評価する。
   * 同一ティック内の連続 kick() は 1 回に束ねる。
   * @returns {'scheduled' | 'coalesced' | 'stopped'}
   */
  function kick() {
    if (!running) return 'stopped';
    if (kickHandle != null) return 'coalesced';
    kickHandle = doSetTimeout(() => {
      kickHandle = null;
      if (!running) return;
      tick('kick');
    }, 0);
    return 'scheduled';
  }

  return {
    register,
    unregister,
    start,
    stop,
    kick,
    tick,
    isRunning: () => running,
    taskCount: () => tasks.size,
    stats: () => ({ ...counters }),
  };
}
