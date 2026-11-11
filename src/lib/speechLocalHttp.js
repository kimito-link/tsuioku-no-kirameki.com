/**
 * speechLocalHttp.js — 注入した fetch でローカル読み上げへ聞くときの期限と失敗分類。
 * fetch 自体は持たない（呼び出し側が渡す）。
 *
 * @module speechLocalHttp
 */

/**
 * @param {(url: string, init?: RequestInit) => Promise<any>} fetchFn
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 */
export async function speechFetch(fetchFn, url, init = {}, timeoutMs = 1500) {
  if (typeof fetchFn !== 'function') {
    const err = new Error('no-fetch');
    err.name = 'SpeechNoFetch';
    throw err;
  }
  const ctrl = new AbortController();
  const parent = init.signal;
  const onAbort = () => ctrl.abort();
  if (parent) {
    if (parent.aborted) ctrl.abort();
    else parent.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), Math.max(200, timeoutMs));
  try {
    return await fetchFn(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    if (parent) parent.removeEventListener('abort', onAbort);
  }
}

/**
 * @param {unknown} err
 * @returns {'timeout'|'refused'|'no-fetch'}
 */
export function classifySpeechFailure(err) {
  const name = String(/** @type {{ name?: string }} */ (err)?.name || '');
  const msg = String(/** @type {{ message?: string }} */ (err)?.message || err || '');
  if (name === 'SpeechNoFetch' || /no-fetch/i.test(msg)) return 'no-fetch';
  if (name === 'AbortError' || /timeout|timed out|aborted/i.test(msg)) return 'timeout';
  return 'refused';
}

/**
 * @param {any} res
 * @returns {Promise<any>}
 */
export async function readSpeechJson(res) {
  if (!res || typeof res.json !== 'function') return null;
  try { return await res.json(); } catch { return null; }
}
