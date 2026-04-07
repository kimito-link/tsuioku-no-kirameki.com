/**
 * TAKT B フォールバック: 来場・入室信号の観測用。既定 OFF。
 * watch ページの MAIN で `sessionStorage.setItem(INTERCEPT_VISITOR_PROBE_SESSION_KEY, '1')` 後にリロードすると、
 * `tryForwardStatistics` に引っかからなかった JSON オブジェクトの **型・キー名だけ** をリングバッファに溜める。
 * 値（ユーザーID 等）は出さない。
 */

export const INTERCEPT_VISITOR_PROBE_SESSION_KEY = 'nls_intercept_visitor_probe';

/** @type {string[]} */
let _ring = [];

/**
 * @returns {boolean}
 */
export function isInterceptVisitorProbeDebugEnabled() {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(INTERCEPT_VISITOR_PROBE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {unknown} obj
 * @returns {string}
 */
export function formatInterceptJsonProbeSnippet(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const o = /** @type {Record<string, unknown>} */ (obj);
  const type = typeof o.type === 'string' ? o.type : '';
  const keys = Object.keys(o).slice(0, 12);
  const parts = [`type=${type || '-'}`, `keys=${keys.join(',')}`];
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
    const dk = Object.keys(/** @type {Record<string, unknown>} */ (o.data)).slice(0, 10);
    parts.push(`dataKeys=${dk.join(',')}`);
  }
  return parts.join('|').slice(0, 200);
}

/**
 * statistics 転送されなかった JSON をリングに記録し、data 属性用の結合文字列を返す。
 *
 * @param {unknown} obj
 * @param {{ maxRing?: number }} [options]
 * @returns {string|null}
 */
export function recordUnforwardedInterceptJsonForProbe(obj, options = {}) {
  const { maxRing = 8 } = options;
  if (!isInterceptVisitorProbeDebugEnabled()) return null;
  const s = formatInterceptJsonProbeSnippet(obj);
  if (!s) return null;
  _ring.push(`${Date.now() % 1e8}:${s}`);
  if (_ring.length > maxRing) _ring = _ring.slice(-maxRing);
  return _ring.join(' ;; ');
}

/** 単体テスト用 */
export function resetInterceptVisitorProbeRingForTest() {
  _ring = [];
}
