/**
 * 応援ユーザーレーンの単一 store。
 *
 * レイヤ: data/ (pure 集合演算 + 最小限の購読通知。DOM には触らない)
 *
 * 役割（lane-architecture-redesign.md §2.3）:
 *   ・domain/lane/aggregate.js が返した LaneCandidate[] を保持する
 *   ・3 列（link/konta/tanu）に分配した派生状態 `byColumn` を計算して保持する
 *   ・liveId（当放送）の文脈を保持する（空なら fallback モード）
 *   ・変更通知は素朴な subscriber コールバック配列で行う（Zustand 互換の最小サブセット）
 *
 * Zustand を入れない理由:
 *   依存を増やさずに 60 行で済むため。後から Zustand に差し替えても
 *   API shape（getState / setState / subscribe）が同じなら呼び出し側は無改修。
 *
 * 契約:
 *   ・このモジュールは DOM / chrome / window に一切触らない
 *   ・`setCandidates` は新しい配列参照を必ず内部で凍結する
 *   ・`setCandidates` の内部で列分配は resolveLaneTier に委ねる（policy の二重実装を避ける）
 */

import { resolveLaneTier } from '../../domain/lane/tier.js';

/**
 * @typedef {import('../../domain/lane/aggregate.js').LaneCandidate} LaneCandidate
 */

/**
 * @typedef {Object} LaneByColumn
 * @property {readonly LaneCandidate[]} link
 * @property {readonly LaneCandidate[]} konta
 * @property {readonly LaneCandidate[]} tanu
 */

/**
 * @typedef {Object} LaneStoreState
 * @property {string} liveId
 * @property {readonly LaneCandidate[]} candidates
 * @property {LaneByColumn} byColumn
 * @property {number} version  変更のたびインクリメント（購読者の簡易差分判定用）
 */

/** @type {LaneByColumn} */
const EMPTY_COLUMNS = Object.freeze({
  link: Object.freeze([]),
  konta: Object.freeze([]),
  tanu: Object.freeze([])
});

/** @type {LaneStoreState} */
const INITIAL_STATE = Object.freeze({
  liveId: '',
  candidates: Object.freeze([]),
  byColumn: EMPTY_COLUMNS,
  version: 0
});

/**
 * candidates を 3 列に分配する。tier 決定は resolveLaneTier に委譲。
 *
 * @param {readonly LaneCandidate[]} candidates
 * @returns {LaneByColumn}
 */
function partitionByColumn(candidates) {
  /** @type {LaneCandidate[]} */
  const link = [];
  /** @type {LaneCandidate[]} */
  const konta = [];
  /** @type {LaneCandidate[]} */
  const tanu = [];
  for (const c of candidates) {
    const tier = resolveLaneTier(c);
    if (tier === 3) link.push(c);
    else if (tier === 2) konta.push(c);
    else if (tier === 1) tanu.push(c);
    // tier 0 は候補から外れる（userId 空など）
  }
  return Object.freeze({
    link: Object.freeze(link),
    konta: Object.freeze(konta),
    tanu: Object.freeze(tanu)
  });
}

/**
 * lane store を 1 つ生成する。複数の lane 文脈を並列に使うには複数呼ぶ。
 * 典型的にはアプリ全体で 1 インスタンスを共有する（`laneStoreInstance` を参照）。
 *
 * @returns {{
 *   getState: () => LaneStoreState,
 *   setCandidates: (liveId: string, candidates: readonly LaneCandidate[]) => void,
 *   reset: () => void,
 *   subscribe: (listener: (state: LaneStoreState) => void) => () => void
 * }}
 */
export function createLaneStore() {
  /** @type {LaneStoreState} */
  let state = INITIAL_STATE;
  /** @type {Set<(s: LaneStoreState) => void>} */
  const listeners = new Set();

  const getState = () => state;

  const notify = () => {
    for (const l of listeners) {
      try {
        l(state);
      } catch (err) {
        // 購読者のエラーで他を止めない
        if (typeof console !== 'undefined' && console?.warn) {
          console.warn('[laneStore] subscriber threw:', err);
        }
      }
    }
  };

  /**
   * @param {string} liveId
   * @param {readonly LaneCandidate[]} candidates
   */
  const setCandidates = (liveId, candidates) => {
    const liveIdStr = String(liveId || '');
    const arr = Array.isArray(candidates) ? candidates.slice() : [];
    const byColumn = partitionByColumn(arr);
    state = Object.freeze({
      liveId: liveIdStr,
      candidates: Object.freeze(arr),
      byColumn,
      version: state.version + 1
    });
    notify();
  };

  const reset = () => {
    if (state === INITIAL_STATE) return;
    state = Object.freeze({
      liveId: '',
      candidates: Object.freeze([]),
      byColumn: EMPTY_COLUMNS,
      version: state.version + 1
    });
    notify();
  };

  /**
   * @param {(s: LaneStoreState) => void} listener
   * @returns {() => void}
   */
  const subscribe = (listener) => {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, setCandidates, reset, subscribe };
}

/**
 * アプリ全体で共有する 1 インスタンス。
 * popup-entry / content-entry / sidepanel は全部これを参照する。
 */
export const laneStoreInstance = createLaneStore();
