/**
 * storyDiagMonotonic.js — 診断カウンタchurn(内訳・用語の顔一覧が増減して見える)の根治。
 *
 * 正本: diagnostic-architecture-strengthen-DESIGN.md C-3。
 *
 * 背景: STORY_AVATAR_DIAG_STATE(popup-entry.js)は複数の非同期経路から `arr` を毎回
 *   全件再集計する。`arr` は reset→書き戻し→intercept マージ等で複数回作り直されるため、
 *   paint がその途中(件数が一時的に少ない状態)を観測すると、ユーザーには「増えたり
 *   減ったりしている」ように見える(実際には記録は減っていない)。
 *
 * 方針(monotonicCommentCount.js の per-live Map パターンを内部委譲): 原理的に減らない
 *   3キー(total/withUid/selfSaved・コメントは記録されたら消えない)だけを、同一 live 内で
 *   単調増加にクランプする。クランプが実際に効いた回数を diagRegressions として計器化し、
 *   「本当は何も直っていないのに黙って辻褄を合わせている」を防ぐ(嘘をつかない)。
 *
 * 掟: 新規 storage read/write・タイマーは追加しない(呼び出し側が既に持つ値を通すだけ)。
 *
 * @module storyDiagMonotonic
 */

import {
  createMonotonicCommentCountMap,
  resolveMonotonicCommentCountForLive,
  forgetMonotonicCommentCountForLive
} from './monotonicCommentCount.js';

/** 単調ゲート対象の3キー(原理的に減らない値のみ)。 */
export const STORY_DIAG_MONOTONIC_KEYS = Object.freeze(['total', 'withUid', 'selfSaved']);

/**
 * @returns {{ maps: Record<'total'|'withUid'|'selfSaved', Map<string, number>>, diagRegressions: number }}
 */
export function createStoryDiagMonotonicState() {
  return {
    maps: {
      total: createMonotonicCommentCountMap(),
      withUid: createMonotonicCommentCountMap(),
      selfSaved: createMonotonicCommentCountMap()
    },
    diagRegressions: 0
  };
}

/**
 * candidates の total/withUid/selfSaved を同一 live 内で単調増加にクランプして返す。
 * 対象外のキーはそのまま通す(コピーして返す・入力を変更しない)。
 * クランプが実際に候補値を引き上げた(=後退を検知した)ときだけ diagRegressions を進める。
 *
 * @param {ReturnType<typeof createStoryDiagMonotonicState>} state
 * @param {string} lv
 * @param {Record<string, unknown>} candidates STORY_AVATAR_DIAG_STATE 相当の平坦なオブジェクト
 * @returns {Record<string, unknown>} クランプ適用後のコピー
 */
export function applyStoryDiagMonotonic(state, lv, candidates) {
  const out = { ...candidates };
  if (!state || typeof state !== 'object' || !candidates || typeof candidates !== 'object') {
    return out;
  }
  for (const key of STORY_DIAG_MONOTONIC_KEYS) {
    const map = /** @type {Record<string, Map<string, number>>} */ (state.maps)?.[key];
    if (!(map instanceof Map)) continue;
    const candidate = candidates[key];
    const resolved = resolveMonotonicCommentCountForLive(map, lv, candidate);
    if (resolved === null) continue;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && resolved > candidate) {
      state.diagRegressions = (state.diagRegressions || 0) + 1;
    }
    out[key] = resolved;
  }
  return out;
}

/**
 * 本当の配信切替(liveIdSwitched)でだけ呼ぶ。該当 live のゲートを破棄する
 * (recording の手動 OFF/ON では呼ばない=max 保持。既存 monotonicCommentCount.js と同じ規律)。
 * @param {ReturnType<typeof createStoryDiagMonotonicState>} state
 * @param {string} lv
 */
export function forgetStoryDiagMonotonicForLive(state, lv) {
  if (!state || typeof state !== 'object') return;
  for (const key of STORY_DIAG_MONOTONIC_KEYS) {
    const map = /** @type {Record<string, Map<string, number>>} */ (state.maps)?.[key];
    if (map instanceof Map) forgetMonotonicCommentCountForLive(map, lv);
  }
}
