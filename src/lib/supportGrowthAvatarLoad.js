/**
 * 応援グリッド等のリモート avatar img が 404 / 失敗したときだけ fallbackSrc へ差し替え、
 * 同一 URL の再試行を避ける。
 * 「URLが無い」コメント用の既定画像は呼び出し側で別途与える（ゆっくりタイル等）。
 */

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * @param {string} url
 * @returns {string}
 */
function defaultUrlKey(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

/**
 * @param {{
 *   fallbackSrc: string,
 *   urlKey?: (s: string) => string,
 *   onFallbackApplied?: (img: HTMLImageElement) => void
 * }} options
 */
export function createSupportAvatarLoadGuard(options) {
  const fallbackSrc = String(options?.fallbackSrc || '');
  const urlKeyFn =
    typeof options?.urlKey === 'function' ? options.urlKey : defaultUrlKey;
  const onFallbackApplied =
    typeof options?.onFallbackApplied === 'function'
      ? options.onFallbackApplied
      : null;

  /** @type {Set<string>} */
  const failedKeys = new Set();

  /**
   * @param {string} requestedSrc
   * @returns {string}
   */
  function pickDisplaySrc(requestedSrc) {
    const req = String(requestedSrc || '').trim();
    if (!req) return fallbackSrc;
    if (!isHttpOrHttpsUrl(req)) return req;
    const key = urlKeyFn(req);
    if (key && failedKeys.has(key)) return fallbackSrc;
    return req;
  }

  /**
   * @param {HTMLImageElement} img
   * @param {string} requestedSrc storyGrowthTileSrcForEntry 等の「意図した」URL（http のみ意味あり）
   */
  function noteRemoteAttempt(img, requestedSrc) {
    if (!(img instanceof HTMLImageElement)) return;
    const req = String(requestedSrc || '').trim();
    if (!isHttpOrHttpsUrl(req)) return;
    if (pickDisplaySrc(req) !== req) return;
    const key = urlKeyFn(req);
    if (!key) return;

    const onError = () => {
      failedKeys.add(key);
      img.src = fallbackSrc;
      onFallbackApplied?.(img);
    };
    img.addEventListener('error', onError, { once: true });
  }

  function clearFailedUrls() {
    failedKeys.clear();
  }

  /** @param {string} url Vitest 用（失敗セットへの直接投入） */
  function markFailedForTests(url) {
    const k = urlKeyFn(String(url || ''));
    if (k) failedKeys.add(k);
  }

  return {
    pickDisplaySrc,
    noteRemoteAttempt,
    clearFailedUrls,
    markFailedForTests
  };
}
