// mutationObserverHub.js — 全配信サービスのチャット・DOM 監視で共有する MutationObserver ハブ。
//   ニコ生・YouTube・Kick などの混雑チャットで MutationObserver コールバックが同期にメインスレッドを奪うのを防ぐ。
//   ・接続・切断・ルート付け替え（SPA 遷移や拡張無効化での切断漏れ防止）
//   ・minIntervalMs でのバッチ集約と maxBatchSize による 1 回あたりの処理件数上限（long task 防止）
//   ・スクロール中の見送り（既存の domHarvestScrollDefer.js を再利用）
//   ・documentElement への subtree: true 常駐張りっぱなしの既定ガード
// @layer L0 — 純粋ロジック / Observer 生成・タイマー・スクロール時刻・可視状態は呼び出し側が注入する

import { shouldDeferDomHarvestDuringScroll } from './domHarvestScrollDefer.js';

/**
 * @typedef {{
 *   observe: (target: any, options?: any) => void,
 *   disconnect: () => void,
 *   takeRecords?: () => any[]
 * }} ObserverLike
 * @typedef {{
 *   overflow: boolean,
 *   droppedCount: number,
 *   remaining: number,
 *   root: any
 * }} MutationHubBatchMeta
 */

const DEFAULT_MIN_INTERVAL_MS = 50;
const DEFAULT_MAX_BATCH_SIZE = 200;
const DEFAULT_MAX_QUEUE_SIZE = 2000;
const DEFAULT_SCROLL_DEFER_MS = 220;

/**
 * documentElement（<html>）へ subtree: true を無制限に張ろうとしているか判定する純関数。
 * allowDocumentElement=true が明示されない限り拒否し、全ページ監視によるフリーズを防ぐ。
 *
 * @param {any} root
 * @param {{ subtree?: boolean } | null | undefined} observeInit
 * @param {boolean} [allowDocumentElement]
 * @returns {boolean} true なら禁止対象
 */
export function isForbiddenDocumentElementSubtree(root, observeInit, allowDocumentElement = false) {
  if (allowDocumentElement === true) return false;
  if (!root || !observeInit || observeInit.subtree !== true) return false;
  if (root.nodeType !== 1) return false;
  const tag = typeof root.tagName === 'string' ? root.tagName.toUpperCase() : '';
  return tag === 'HTML';
}

/**
 * @param {{
 *   onBatch: (records: any[], meta: MutationHubBatchMeta) => void,
 *   observeInit?: Record<string, unknown>,
 *   minIntervalMs?: number,
 *   maxBatchSize?: number,
 *   maxQueueSize?: number,
 *   scrollDeferMs?: number,
 *   getLastScrollAt?: () => number,
 *   isHidden?: () => boolean,
 *   pauseWhenHidden?: boolean,
 *   isPaused?: () => boolean,
 *   isAlive?: () => boolean,
 *   allowDocumentElement?: boolean,
 *   onError?: (err: unknown) => void,
 *   createObserver?: (cb: (records: any[]) => void) => ObserverLike | null,
 *   now?: () => number,
 *   setTimeoutFn?: (fn: () => void, ms: number) => unknown,
 *   clearTimeoutFn?: (handle: unknown) => void
 * }} opts
 */
export function createMutationObserverHub(opts) {
  if (!opts || typeof opts.onBatch !== 'function') {
    throw new TypeError('createMutationObserverHub requires opts.onBatch function');
  }
  const onBatch = opts.onBatch;
  const defaultObserveInit = opts.observeInit || { childList: true, subtree: true };
  const minIntervalMs = Math.max(0, Math.floor(Number(opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS) || 0));
  const maxBatchSize = Math.max(1, Math.floor(Number(opts.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE) || DEFAULT_MAX_BATCH_SIZE));
  const maxQueueSize = Math.max(maxBatchSize, Math.floor(Number(opts.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE) || DEFAULT_MAX_QUEUE_SIZE));
  const scrollDeferMs = Math.max(0, Math.floor(Number(opts.scrollDeferMs ?? DEFAULT_SCROLL_DEFER_MS) || 0));
  const getLastScrollAt = typeof opts.getLastScrollAt === 'function' ? opts.getLastScrollAt : null;
  const isHiddenFn = typeof opts.isHidden === 'function' ? opts.isHidden : () => false;
  const pauseWhenHidden = opts.pauseWhenHidden === true;
  const isPausedFn = typeof opts.isPaused === 'function' ? opts.isPaused : () => false;
  const isAliveFn = typeof opts.isAlive === 'function' ? opts.isAlive : () => true;
  const allowDocumentElement = opts.allowDocumentElement === true;
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  const nowFn = typeof opts.now === 'function' ? opts.now : () => Date.now();
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
  /** @type {(cb: (records: any[]) => void) => ObserverLike | null} */
  const createObserver =
    typeof opts.createObserver === 'function'
      ? opts.createObserver
      : (/** @type {(records: any[]) => void} */ cb) =>
          typeof MutationObserver === 'function' ? new MutationObserver(cb) : null;

  /** @type {ObserverLike | null} */
  let observer = null;
  /** @type {any} */
  let currentRoot = null;
  /** @type {any[]} */
  let queue = [];
  let droppedSinceLastFlush = 0;
  /** @type {unknown} */
  let timer = null;
  let lastFlushAt = -Infinity;
  let disposed = false;

  const counters = {
    received: 0,
    flushed: 0,
    droppedOverflow: 0,
    deferredScroll: 0,
    deferredHidden: 0,
    attaches: 0,
    detaches: 0,
    errors: 0,
  };

  /**
   * @param {() => boolean} fn
   * @returns {boolean}
   */
  function safeBool(fn) {
    try {
      return !!fn();
    } catch {
      return false;
    }
  }

  function clearTimer() {
    if (timer != null) {
      doClearTimeout(timer);
      timer = null;
    }
  }

  /**
   * @param {number} delayMs
   */
  function scheduleFlush(delayMs) {
    if (disposed || timer != null || queue.length === 0) return;
    const wait = Math.max(0, Math.floor(Number(delayMs) || 0));
    timer = doSetTimeout(() => {
      timer = null;
      flushBatch(false);
    }, wait);
  }

  /**
   * @param {boolean} force
   * @returns {number} 今回 onBatch へ渡した件数
   */
  function flushBatch(force) {
    if (disposed) return 0;
    if (!safeBool(isAliveFn)) {
      dispose();
      return 0;
    }
    if (queue.length === 0) return 0;

    const now = nowFn();
    if (!force) {
      if ((pauseWhenHidden && safeBool(isHiddenFn)) || safeBool(isPausedFn)) {
        counters.deferredHidden += 1;
        return 0;
      }
      if (getLastScrollAt) {
        let lastScroll = 0;
        try {
          lastScroll = Number(getLastScrollAt()) || 0;
        } catch {
          lastScroll = 0;
        }
        if (shouldDeferDomHarvestDuringScroll(now, lastScroll, scrollDeferMs)) {
          counters.deferredScroll += 1;
          const remainingScrollMs = Math.max(16, lastScroll + scrollDeferMs - now);
          scheduleFlush(Math.max(minIntervalMs, remainingScrollMs));
          return 0;
        }
      }
      const waitMs = Number.isFinite(lastFlushAt) ? lastFlushAt + minIntervalMs - now : 0;
      if (waitMs > 0) {
        scheduleFlush(waitMs);
        return 0;
      }
    }

    const batch = queue.splice(0, maxBatchSize);
    const dropped = droppedSinceLastFlush;
    droppedSinceLastFlush = 0;
    lastFlushAt = now;
    counters.flushed += batch.length;

    try {
      onBatch(batch, {
        overflow: dropped > 0,
        droppedCount: dropped,
        remaining: queue.length,
        root: currentRoot,
      });
    } catch (err) {
      counters.errors += 1;
      if (onError) onError(err);
    }

    if (queue.length > 0 && !disposed) {
      scheduleFlush(minIntervalMs);
    }
    return batch.length;
  }

  /**
   * @param {any[]} records
   */
  function handleMutations(records) {
    if (disposed) return;
    if (!safeBool(isAliveFn)) {
      dispose();
      return;
    }
    if (!Array.isArray(records) || records.length === 0) return;
    counters.received += records.length;
    for (let i = 0; i < records.length; i += 1) {
      queue.push(records[i]);
    }
    if (queue.length > maxQueueSize) {
      const excess = queue.length - maxQueueSize;
      queue.splice(0, excess);
      droppedSinceLastFlush += excess;
      counters.droppedOverflow += excess;
    }
    const now = nowFn();
    const waitMs = Number.isFinite(lastFlushAt) ? Math.max(0, lastFlushAt + minIntervalMs - now) : minIntervalMs;
    scheduleFlush(waitMs);
  }

  /**
   * 監視ルートへ接続（または付け替え）する。
   * 同一ルートへの再接続や禁止ルート（documentElement + subtree）は false を返す。
   *
   * @param {any} root
   * @param {Record<string, unknown>} [observeInit]
   * @returns {boolean}
   */
  function attach(root, observeInit) {
    if (disposed || !root) return false;
    if (!safeBool(isAliveFn)) {
      dispose();
      return false;
    }
    const init = observeInit || defaultObserveInit;
    if (isForbiddenDocumentElementSubtree(root, init, allowDocumentElement)) {
      return false;
    }
    if (observer && currentRoot === root) {
      return false;
    }
    if (observer) {
      try {
        observer.disconnect();
      } catch {
        /* 切断時の例外は無視して新しいルートへ移る */
      }
      observer = null;
      currentRoot = null;
      counters.detaches += 1;
    }
    const nextObserver = createObserver(handleMutations);
    if (!nextObserver || typeof nextObserver.observe !== 'function') {
      return false;
    }
    try {
      nextObserver.observe(root, init);
    } catch (err) {
      counters.errors += 1;
      if (onError) onError(err);
      return false;
    }
    observer = nextObserver;
    currentRoot = root;
    counters.attaches += 1;
    return true;
  }

  /**
   * 監視を切断する。SPA 遷移時などに呼ぶ。
   * @param {{ clearQueue?: boolean }} [detachOpts]
   */
  function detach(detachOpts = {}) {
    clearTimer();
    if (observer) {
      try {
        observer.disconnect();
      } catch {
        /* no-op */
      }
      observer = null;
      counters.detaches += 1;
    }
    currentRoot = null;
    if (detachOpts.clearQueue !== false) {
      queue = [];
      droppedSinceLastFlush = 0;
    }
  }

  /** スクロール終了・表タブ復帰時に保留キューがあれば再開する */
  function kick() {
    if (disposed || queue.length === 0) return;
    if ((pauseWhenHidden && safeBool(isHiddenFn)) || safeBool(isPausedFn)) return;
    scheduleFlush(0);
  }

  /** 離脱前・テスト用の即時フラッシュ（maxBatchSize の上限は維持） */
  function flushNow() {
    clearTimer();
    return flushBatch(true);
  }

  /** 完全破棄（以後 attach / kick は no-op） */
  function dispose() {
    disposed = true;
    detach({ clearQueue: true });
  }

  return {
    attach,
    detach,
    kick,
    flushNow,
    dispose,
    isAttached: () => observer !== null && currentRoot !== null,
    getRoot: () => currentRoot,
    pendingCount: () => queue.length,
    stats: () => ({ ...counters }),
  };
}
