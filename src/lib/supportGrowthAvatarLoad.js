/**
 * 応援グリッド等のリモート avatar img の読み込みガード。
 *
 * 星野ロミ Avatar.tsx パターン:
 *   fallback を先に表示 → バックグラウンドでプローブ → 成功時だけ差し替え
 *   → 404 フリッカーを完全に防止。
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
 *   onFallbackApplied?: (img: HTMLImageElement) => void,
 *   onRemoteSuccess?: (img: HTMLImageElement) => void,
 *   timeoutMs?: number
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
  const onRemoteSuccess =
    typeof options?.onRemoteSuccess === 'function'
      ? options.onRemoteSuccess
      : null;
  const timeoutRaw = Number(options?.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 3000;

  /** @type {Set<string>} */
  const failedKeys = new Set();
  /** @type {Set<string>} */
  const succeededKeys = new Set();
  /** @type {WeakMap<HTMLImageElement, () => void>} */
  const activeProbes = new WeakMap();

  /**
   * 未確認の HTTP URL にはフォールバックを返す（フリッカー防止）。
   * @param {string} requestedSrc
   * @returns {string}
   */
  function pickDisplaySrc(requestedSrc) {
    const req = String(requestedSrc || '').trim();
    if (!req) return fallbackSrc;
    if (!isHttpOrHttpsUrl(req)) return req;
    if (req === fallbackSrc) return req;
    const key = urlKeyFn(req);
    if (key && failedKeys.has(key)) return fallbackSrc;
    if (key && succeededKeys.has(key)) return req;
    return fallbackSrc;
  }

  /**
   * バックグラウンドプローブ: 隠し Image で読み込みテストし、成功時のみ可視 img.src を差し替え。
   * @param {HTMLImageElement} img
   * @param {string} requestedSrc
   * @returns {HTMLImageElement|null} プローブ Image（テスト用）。プローブ不要なら null。
   */
  function noteRemoteAttempt(img, requestedSrc) {
    if (!(img instanceof HTMLImageElement)) return null;
    const req = String(requestedSrc || '').trim();
    if (!isHttpOrHttpsUrl(req)) return null;
    if (req === fallbackSrc) return null;
    const key = urlKeyFn(req);
    if (!key) return null;
    if (failedKeys.has(key)) return null;

    const cancelPrev = activeProbes.get(img);
    if (cancelPrev) {
      cancelPrev();
      activeProbes.delete(img);
    }

    if (succeededKeys.has(key)) {
      if (img.getAttribute('src') !== req) {
        img.src = req;
        onRemoteSuccess?.(img);
      }
      return null;
    }

    let settled = false;
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timer = null;
    const probe = document.createElement('img');

    const cleanup = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      activeProbes.delete(img);
    };

    const applyFailed = () => {
      if (settled) return;
      settled = true;
      failedKeys.add(key);
      onFallbackApplied?.(img);
      cleanup();
    };

    const applySuccess = () => {
      if (settled) return;
      settled = true;
      succeededKeys.add(key);
      img.src = req;
      onRemoteSuccess?.(img);
      cleanup();
    };

    probe.addEventListener('load', applySuccess, { once: true });
    probe.addEventListener('error', applyFailed, { once: true });
    timer = setTimeout(applyFailed, timeoutMs);

    activeProbes.set(img, () => {
      if (!settled) {
        settled = true;
        cleanup();
      }
    });

    probe.src = req;
    return probe;
  }

  function clearFailedUrls() {
    failedKeys.clear();
    succeededKeys.clear();
  }

  /** @param {string} url Vitest 用（失敗セットへの直接投入） */
  function markFailedForTests(url) {
    const k = urlKeyFn(String(url || ''));
    if (k) failedKeys.add(k);
  }

  /** @param {string} url Vitest 用（成功セットへの直接投入） */
  function markSucceededForTests(url) {
    const k = urlKeyFn(String(url || ''));
    if (k) succeededKeys.add(k);
  }

  /**
   * v0.1.339: 「照合済みなのにサムネが出ない」②の真因切り分け用診断。
   *   合成 usericon URL（/nicoaccount/usericon/...）の load 成否を集計して、
   *   どれだけが 404/timeout で fallback に落ちているかを実機ログで可視化する。
   *   key は `origin+pathname` 小文字（probe 結果ベース）なので副作用なしの読み取りのみ。
   * @returns {{
   *   succeededTotal: number, failedTotal: number,
   *   usericonSucceeded: number, usericonFailed: number,
   *   failedUsericonSamples: string[]
   * }}
   */
  function getDiagnostics() {
    /** @param {string} k */
    const isUsericon = (k) => /\/nicoaccount\/usericon\//i.test(String(k || ''));
    let usericonSucceeded = 0;
    for (const k of succeededKeys) if (isUsericon(k)) usericonSucceeded += 1;
    let usericonFailed = 0;
    /** @type {string[]} */
    const failedUsericonSamples = [];
    for (const k of failedKeys) {
      if (!isUsericon(k)) continue;
      usericonFailed += 1;
      if (failedUsericonSamples.length < 5) failedUsericonSamples.push(k);
    }
    return {
      succeededTotal: succeededKeys.size,
      failedTotal: failedKeys.size,
      usericonSucceeded,
      usericonFailed,
      failedUsericonSamples
    };
  }

  return {
    pickDisplaySrc,
    noteRemoteAttempt,
    clearFailedUrls,
    markFailedForTests,
    markSucceededForTests,
    getDiagnostics
  };
}
