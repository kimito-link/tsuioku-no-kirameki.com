/**
 * watch インラインパネルの読み込みフェーズ計測（DevTools / 実機メモ用）。
 * localStorage `nls_debug_watch_popup_load=1` のときだけ console.debug する。
 *
 * @module watchPopupLoadDiagnostics
 */

/** @type {number} */
let _t0 = 0;
/** @type {string} */
let _liveId = '';
// v0.1.1123: 直近フェーズを debug フラグと無関係に常時保持(状態速報の loadShadeProbe が読む)。
//   「ローディングがつねに出る」の切り分け=幕がどのフェーズまで進んで止まったかを実測する。
/** @type {string} */
let _lastPhase = '';
/** @type {number} */
let _lastPhaseAt = 0;

/**
 * @returns {boolean}
 */
function debugEnabled() {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('nls_debug_watch_popup_load') === '1'
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} liveId
 */
export function resetWatchPopupLoadDiagnostics(liveId) {
  _t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  _liveId = String(liveId || '').trim().toLowerCase();
}

/**
 * @param {string} phase
 * @param {Record<string, unknown>} [extra]
 */
export function markWatchPopupLoadPhase(phase, extra = {}) {
  // v0.1.1123: 記録(常時)と console 出力(debug フラグ時のみ)を分離。挙動変更ゼロ・観測のみ。
  _lastPhase = String(phase || '');
  _lastPhaseAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!debugEnabled()) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ms = Math.max(0, Math.round(now - _t0));
  console.debug('[nls watch-popup load]', phase, {
    ms,
    liveId: _liveId,
    ...extra
  });
}

/**
 * 直近フェーズのスナップショット(popup固有診断の loadShadeProbe 用)。
 * @param {number} [nowMs] performance.now 相当(agoMs 算出用)
 * @returns {{ phase: string, agoMs: number|null }}
 */
export function snapshotWatchPopupLoadPhase(nowMs) {
  const now = Number.isFinite(Number(nowMs))
    ? Number(nowMs)
    : typeof performance !== 'undefined'
      ? performance.now()
      : Date.now();
  return {
    phase: _lastPhase,
    agoMs: _lastPhaseAt > 0 ? Math.max(0, Math.round(now - _lastPhaseAt)) : null
  };
}
