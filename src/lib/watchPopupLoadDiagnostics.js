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
  if (!debugEnabled()) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ms = Math.max(0, Math.round(now - _t0));
  // eslint-disable-next-line no-console
  console.debug('[nls watch-popup load]', phase, {
    ms,
    liveId: _liveId,
    ...extra
  });
}
